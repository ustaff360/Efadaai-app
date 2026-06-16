"""
SQLAlchemy Models — Agents
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    extension = Column(String(20), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    status = Column(String(20), default="active", nullable=False)  # active, inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<Agent(id={self.id}, name='{self.name}', ext='{self.extension}')>"
