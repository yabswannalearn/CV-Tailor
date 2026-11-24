from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Date, LargeBinary, JSON, Boolean, Index, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import relationship, deferred, column_property
from sqlalchemy.sql import func
from uuid import uuid4
from cv_tailor.database import Base

class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (CheckConstraint("id = 1", name="single_local_workspace"),)
    id = Column(Integer, primary_key=True, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    job_applications = relationship("JobApplication", back_populates="owner", cascade="all, delete")
    profile = relationship("Profile", back_populates="owner", uselist=False, cascade="all, delete")
    assistant_conversations = relationship("AssistantConversation", cascade="all, delete-orphan")

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, unique=True, default=1)
    revision = Column(Integer, nullable=False, default=1)
    first_name = Column(String(50))
    last_name = Column(String(50))
    mobile_no = Column(String(20))
    email = Column(String(100))
    linkedin = Column(String(255))
    github = Column(String(255))
    portfolio = Column(String(255))
    preferred_template = Column(String(50), default="classic")
    preset_slug = Column(String(50), default="blank")

    owner = relationship("Workspace", back_populates="profile")
    education = relationship("Education", back_populates="owner", cascade="all, delete")
    experience = relationship("Experience", back_populates="owner", cascade="all, delete")
    projects = relationship("Project", back_populates="owner", cascade="all, delete")
    skills = relationship("Skill", back_populates="owner", cascade="all, delete")
    certifications = relationship("Certification", back_populates="owner", cascade="all, delete")


class WorkspacePreferences(Base):
    __tablename__ = "workspace_preferences"
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), primary_key=True, default=1)
    revision = Column(Integer, nullable=False, default=1)
    workspace_uuid = Column(String(32), nullable=False, default=lambda: uuid4().hex)
    # Null preserves the existing profile default until an explicit choice is saved.
    resume_template = Column(String(50), nullable=True)
    tracking_connection = Column(JSON, nullable=True)
    calendar_connections = Column(JSON, nullable=False, default=list, server_default="[]")
    portfolio_preference = Column(JSON, nullable=True)

class Education(Base):
    __tablename__ = "education"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), index=True)
    school_name = Column(String(150))
    course = Column(String(150))
    location = Column(String(100))
    date_range = Column(String(50))
    description = Column(Text)
    owner = relationship("Profile", back_populates="education")

class Experience(Base):
    __tablename__ = "experience"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), index=True)
    job_title = Column(String(100))
    company = Column(String(100))
    location = Column(String(100))
    description = Column(Text)
    date_range = Column(String(50))
    owner = relationship("Profile", back_populates="experience")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), index=True)
    name = Column(String(100))
    description = Column(Text)
    date_range = Column(String(50))
    link = Column(Text, nullable=True)
    owner = relationship("Profile", back_populates="projects")

class Skill(Base):
    __tablename__ = "skills"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), index=True)
    skill_name = Column(String(50))
    is_confirmed = Column(Boolean, nullable=False, default=False, server_default="false")
    owner = relationship("Profile", back_populates="skills")

class Certification(Base):
    __tablename__ = "certifications"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), index=True)
    name = Column(String(150))
    issuer = Column(String(150))
    date_issued = Column(String(50))
    owner = relationship("Profile", back_populates="certifications")

class JobApplication(Base):
    __tablename__ = "job_applications"
    __table_args__ = (
        Index("ix_job_applications_user_created", "workspace_id", "created_at"),
        Index("ix_job_applications_user_status", "workspace_id", "status"),
    )
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, default=1)
    revision = Column(Integer, nullable=False, default=1)
    company_name = Column(String(150), nullable=False)
    job_title = Column(String(150), nullable=False)
    job_url = Column(Text)  # Changed from String(500) to Text to support long URLs (e.g., Indeed URLs with many parameters)
    job_source = Column(String(250))
    is_archived = Column(Boolean, nullable=False, default=False, server_default="false")
    short_description = Column(Text)       # keep for display
    job_description = Column(Text)         # full JD for AI
    pdf_data = deferred(Column(LargeBinary))
    has_pdf = column_property(pdf_data.expression.isnot(None))
    pdf_generated_at = Column(DateTime(timezone=True))
    status = Column(String(50), default="Saved")
    date_applied = Column(Date)
    follow_up_date = Column(Date)
    job_type = Column(String(50))
    location = Column(String(150))
    salary_range = Column(String(100))
    priority = Column(String(20), default="Medium")
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    latex_source = Column(Text)
    cover_letter = Column(Text)
    template_id = Column(String(50), default="classic", nullable=False)
    match_score = Column(Integer, nullable=True)
    match_analysis = Column(JSON, nullable=True)

    owner = relationship("Workspace", back_populates="job_applications")
    assistant_conversations = relationship("AssistantConversation", cascade="all, delete-orphan")


class AssistantConversation(Base):
    __tablename__ = "assistant_conversations"
    __table_args__ = (UniqueConstraint("workspace_id", "job_id", name="uq_assistant_user_job"),)
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True, default=1)
    job_id = Column(Integer, ForeignKey("job_applications.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(200), nullable=False, default="General conversation")
    active_request_key = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    messages = relationship("AssistantMessage", cascade="all, delete-orphan", order_by="AssistantMessage.id")
    drafts = relationship("AssistantDraft", cascade="all, delete-orphan", order_by="AssistantDraft.id")


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (UniqueConstraint("conversation_id", "request_key", name="uq_assistant_message_request"),)
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("assistant_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    request_key = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AssistantDraft(Base):
    __tablename__ = "assistant_drafts"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("assistant_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(40), nullable=False)
    content = Column(Text, nullable=False)
    pdf_data = deferred(Column(LargeBinary))
    details = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AssistantTurn(Base):
    __tablename__ = "assistant_turns"
    __table_args__ = (UniqueConstraint("conversation_id", "request_key", name="uq_assistant_turn_request"),)
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("assistant_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    request_key = Column(String(80), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="in_progress")
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OperationReceipt(Base):
    __tablename__ = "operation_receipts"
    request_id = Column(String(100), primary_key=True)
    fingerprint = Column(String(64), nullable=False)
    result = Column(JSON, nullable=False)

class ResumePreset(Base):
    __tablename__ = "resume_presets"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    target_summary_prompt = Column(Text, nullable=False)
    core_skills_bank = Column(JSON, nullable=False)
    metric_prompts = Column(JSON, nullable=False)
    section_order = Column(JSON, nullable=False)
    recommended_template = Column(String(50), nullable=False, default="classic")
    lever_guidance = Column(Text, nullable=False)
