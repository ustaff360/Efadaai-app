"""
Audit trail for agent selection decisions.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Index, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class AgentSelectionAudit(Base):
    __tablename__ = "agent_selection_audit"

    id = Column(Integer, primary_key=True, autoincrement=True)
    caller_id = Column(String(30), nullable=False, index=True)
    did = Column(String(30), nullable=True, index=True)
    category = Column(String(100), nullable=True, index=True)
    routing_strategy = Column(String(20), nullable=False, index=True)
    is_new_caller = Column(Boolean, nullable=False, default=False, index=True)
    sticky_hit = Column(Boolean, nullable=False, default=False, index=True)
    available_agents = Column(Text, nullable=True)
    weights_used = Column(Text, nullable=True)
    selected_agent = Column(String(100), nullable=True)
    selected_extension = Column(String(20), nullable=True)
    reason_for_selection = Column(String(255), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index("ix_agent_sel_audit_time_caller", "timestamp", "caller_id"),
        Index("ix_agent_sel_audit_strategy", "routing_strategy", "timestamp"),
    )
