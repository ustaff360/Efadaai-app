"""
SQLAlchemy Models — Callers & Call Logs
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(100), nullable=True)
    role = Column(String(20), nullable=True)
    action = Column(String(50), nullable=False, index=True)
    resource_type = Column(String(50), nullable=False, index=True)
    resource_id = Column(Integer, nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    details_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action='{self.action}', resource='{self.resource_type}:{self.resource_id}')>"


class Caller(Base):
    __tablename__ = "callers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    caller_number = Column(String(30), unique=True, nullable=False, index=True)
    caller_name = Column(String(100), nullable=True)
    total_calls = Column(Integer, default=0, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    block_reason = Column(String(255), nullable=True)
    last_call_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<Caller(id={self.id}, number='{self.caller_number}', blocked={self.is_blocked})>"


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_uuid = Column(String(36), unique=True, nullable=False, index=True)
    caller_number = Column(String(30), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    did_id = Column(Integer, ForeignKey("dids.id"), nullable=True)
    call_start = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    call_end = Column(DateTime(timezone=True), nullable=True)
    duration_sec = Column(Integer, default=0, nullable=False)
    is_repeat = Column(Boolean, default=False, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    recording_path = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    agent = relationship("Agent", lazy="selectin")
    category = relationship("Category", lazy="selectin")

    def __repr__(self):
        return f"<CallLog(id={self.id}, caller='{self.caller_number}', call_uuid='{self.call_uuid}')>"


class BlockList(Base):
    __tablename__ = "block_list"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phone_number = Column(String(30), unique=True, nullable=False, index=True)
    reason = Column(String(255), nullable=True)
    destination = Column(String(50), default="voicemail", nullable=False)  # voicemail, announcement, extension
    destination_value = Column(String(50), nullable=True)  # extension number if destination=extension
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<BlockList(number='{self.phone_number}', active={self.active})>"
