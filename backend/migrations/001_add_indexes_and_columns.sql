-- Migration 001: Add required indexes and new columns
-- Generated: 2026-05-24

-- =========================================
-- 1. ADD REQUIRED INDEXES FOR FAST LOOKUPS
-- =========================================

-- Index on category_id for fast category-based queries
CREATE INDEX IF NOT EXISTS idx_calllog_category 
ON call_logs(category_id);

-- Index on did_id for fast DID-based queries
CREATE INDEX IF NOT EXISTS idx_calllog_did 
ON call_logs(did_id);

-- Composite index on is_repeat and is_blocked for filtering
CREATE INDEX IF NOT EXISTS idx_calllog_repeat_blocked 
ON call_logs(is_repeat, is_blocked);

-- Index on duration_sec DESC for getting longest calls first
CREATE INDEX IF NOT EXISTS idx_calllog_duration 
ON call_logs(duration_sec DESC);

-- Index on caller_number for fast caller lookups
CREATE INDEX IF NOT EXISTS idx_calllog_caller_number 
ON call_logs(call_caller_number);

-- Index on call_start DESC for recent calls
CREATE INDEX IF NOT EXISTS idx_calllog_call_start 
ON call_logs(call_start DESC);

-- =========================================
-- 2. ADD MISSING COLUMNS TO CALL_LOG
-- =========================================

-- Recording metadata fields (nullable - existing calls can be left empty)
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS recording_duration_sec INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recording_file_size INT DEFAULT NULL;

-- =========================================
-- 3. ADD CURRENT_STATUS AND LAST_CALL_AT TO AGENT
-- =========================================

-- For sticky routing and real-time agent availability
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS current_status VARCHAR(20) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sticky_window_days INT DEFAULT 30;

-- Index on last_call_at for sticky logic
CREATE INDEX IF NOT EXISTS idx_agent_last_call_at 
ON agents(last_call_at);

-- =========================================
-- 4. ADD SOURCE_NUMBER AND DESTINATION_NUMBER TO CALL_LOG
-- =========================================

-- Captures CALL_SOURCE and routed extension (e.g., CALL_SOURCE, dest=123)
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS source_number VARCHAR(30) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS destination_number VARCHAR(30) DEFAULT NULL;

-- =========================================
-- 5. ADD CALL_STATUS TO CALL_LOG
-- =========================================

-- Tracks: answered, voicemail, busy, no-answer, dropped
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS call_status VARCHAR(30) DEFAULT 'answered';

-- =========================================
-- 6. ADD UNIQUE CONSTRAINT TO PREVENT DUPLICATE LOGGING
-- =========================================

-- Prevents duplicate call logs for same caller at same time
CREATE UNIQUE INDEX IF NOT EXISTS idx_calllog_caller_time_unique 
ON call_logs(call_caller_number, call_start);

-- =========================================
-- 7. ADD TRIGGER FOR AUTOMATIC CALLER.total_calls UPDATE
-- =========================================

-- Increments total_calls when a new call_log is inserted
CREATE OR REPLACE FUNCTION trigger_update_caller_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment total_calls for the caller
    UPDATE callers 
    SET total_calls = total_calls + 1 
    WHERE caller_number = NEW.call_caller_number;
    
    -- Update last_call_at
    UPDATE callers 
    SET last_call_at = NEW.call_start 
    WHERE caller_number = NEW.call_caller_number;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to call_logs table
DROP TRIGGER IF EXISTS trigger_update_caller_stats ON call_logs;
CREATE TRIGGER trigger_update_caller_stats
AFTER INSERT ON call_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_update_caller_stats();

-- =========================================
-- 8. ADD BLOCK_REASON TO CALLER
-- =========================================

-- Optional field for why a caller was blocked
ALTER TABLE callers 
ADD COLUMN IF NOT EXISTS block_reason TEXT DEFAULT NULL;

-- =========================================
-- 9. ADD DESTINATION TO BLOCK_LIST
-- =========================================

-- Tracks where blocked calls go: voicemail, announcement, extension
ALTER TABLE block_list 
ADD COLUMN IF NOT EXISTS destination VARCHAR(50) DEFAULT 'voicemail',
ADD COLUMN IF NOT EXISTS destination_value VARCHAR(50) DEFAULT NULL;

-- =========================================
-- 10. ADD RECORDING_PATH INDEX
-- =========================================

CREATE INDEX IF NOT EXISTS idx_calllog_recording_path 
ON call_logs(recording_path);

-- =========================================
-- VERIFICATION
-- =========================================

-- Check if indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN ('call_logs', 'agents', 'callers')
ORDER BY tablename, indexname;

-- Check if triggers exist
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_caller_stats';

-- =========================================
-- ROLLBACK (for testing)
-- =========================================

/*
-- To rollback this migration, run:

DROP TRIGGER IF EXISTS trigger_update_caller_stats ON call_logs;
DROP INDEX IF EXISTS idx_calllog_recording_path;
DROP INDEX IF EXISTS idx_calllog_caller_time_unique;
DROP INDEX IF EXISTS idx_calllog_caller_number;
DROP INDEX IF EXISTS idx_calllog_call_start;
DROP INDEX IF EXISTS idx_calllog_duration;
DROP INDEX IF EXISTS idx_calllog_repeat_blocked;
DROP INDEX IF EXISTS idx_calllog_did;
DROP INDEX IF EXISTS idx_calllog_category;
DROP INDEX IF EXISTS idx_agent_last_call_at;
DROP INDEX IF EXISTS idx_calllog_caller_number_time;

-- Drop columns (note: if data exists, will error - use alter_table ... DROP COLUMN ... SET NOT NULL first if needed)
ALTER TABLE call_logs DROP COLUMN IF EXISTS recording_duration_sec;
ALTER TABLE call_logs DROP COLUMN IF EXISTS recording_file_size;
ALTER TABLE call_logs DROP COLUMN IF EXISTS source_number;
ALTER TABLE call_logs DROP COLUMN IF EXISTS destination_number;
ALTER TABLE call_logs DROP COLUMN IF EXISTS call_status;
ALTER TABLE callers DROP COLUMN IF EXISTS block_reason;
ALTER TABLE block_list DROP COLUMN IF EXISTS destination;
ALTER TABLE block_list DROP COLUMN IF EXISTS destination_value;

ALTER TABLE agents DROP COLUMN IF EXISTS current_status;
ALTER TABLE agents DROP COLUMN IF EXISTS last_call_at;
ALTER TABLE agents DROP COLUMN IF EXISTS sticky_window_days;
*/
