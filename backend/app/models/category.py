"""
SQLAlchemy Models — Categories
"""
from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    customer_name = Column(String(100), nullable=True)
    contact_number = Column(String(30), nullable=True)
    owner_email = Column(String(255), nullable=True)
    locations = Column(JSON, default=list, nullable=True)
    status = Column(String(20), default="active", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    dids = relationship("DID", back_populates="category", lazy="selectin")
    category_agents = relationship("CategoryAgent", back_populates="category", lazy="selectin")

    def __repr__(self):
        return f"<Category(id={self.id}, name='{self.name}')>"


class DID(Base):
    __tablename__ = "dids"

    id = Column(Integer, primary_key=True, autoincrement=True)
    did_number = Column(String(30), unique=True, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    category = relationship("Category", back_populates="dids")

    def __repr__(self):
        return f"<DID(id={self.id}, number='{self.did_number}')>"


class CategoryAgent(Base):
    __tablename__ = "category_agents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("agents.id"), nullable=False)
    override_weight = Column(Integer, nullable=True)  # NULL = use default_weight
    routing_strategy = Column(String(20), default="weighted", nullable=False)  # weighted, round_robin, sequential
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    category = relationship("Category", back_populates="category_agents")
    agent = relationship("Agent", lazy="selectin")

    def __repr__(self):
        return f"<CategoryAgent(cat={self.category_id}, agent={self.agent_id}, strategy={self.routing_strategy})>"
