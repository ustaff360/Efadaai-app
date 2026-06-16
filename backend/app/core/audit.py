"""Audit logging helper — records actions with the current user/request context."""
from app.models.caller import AuditLog


def log_audit(db, *, user_id=None, username=None, role=None, action=None, resource_type=None, resource_id=None, ip_address=None, user_agent=None, details=None, flush=False):
    record = AuditLog(
        user_id=user_id,
        username=username,
        role=role,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details_json=str(details) if details else None,
    )
    db.add(record)
    if flush:
        db.flush()
    return record
