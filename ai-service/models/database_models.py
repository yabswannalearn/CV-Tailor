from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Date, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    job_applications = relationship("JobApplication", back_populates="owner", cascade="all, delete")
    profile = relationship("Profile", back_populates="owner", uselist=False, cascade="all, delete")

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    first_name = Column(String(50))
    last_name = Column(String(50))
    mobile_no = Column(String(20))
    email = Column(String(100))
    linkedin = Column(String(255))
    github = Column(String(255))
    portfolio = Column(String(255))

    owner = relationship("User", back_populates="profile")
    education = relationship("Education", back_populates="owner", cascade="all, delete")
    experience = relationship("Experience", back_populates="owner", cascade="all, delete")
    projects = relationship("Project", back_populates="owner", cascade="all, delete")
    skills = relationship("Skill", back_populates="owner", cascade="all, delete")
    certifications = relationship("Certification", back_populates="owner", cascade="all, delete")

class Education(Base):
    __tablename__ = "education"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    school_name = Column(String(150))
    course = Column(String(150))
    location = Column(String(100))
    date_range = Column(String(50))
    description = Column(Text)
    owner = relationship("Profile", back_populates="education")

class Experience(Base):
    __tablename__ = "experience"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    job_title = Column(String(100))
    company = Column(String(100))
    location = Column(String(100))
    description = Column(Text)
    date_range = Column(String(50))
    owner = relationship("Profile", back_populates="experience")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    name = Column(String(100))
    description = Column(Text)
    date_range = Column(String(50))
    owner = relationship("Profile", back_populates="projects")

class Skill(Base):
    __tablename__ = "skills"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    skill_name = Column(String(50))
    owner = relationship("Profile", back_populates="skills")

class Certification(Base):
    __tablename__ = "certifications"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    name = Column(String(150))
    issuer = Column(String(150))
    date_issued = Column(String(50))
    owner = relationship("Profile", back_populates="certifications")

class JobApplication(Base):
    __tablename__ = "job_applications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_name = Column(String(150), nullable=False)
    job_title = Column(String(150), nullable=False)
    job_url = Column(Text)  # Changed from String(500) to Text to support long URLs (e.g., Indeed URLs with many parameters)
    short_description = Column(Text)       # keep for display
    job_description = Column(Text)         # full JD for AI
    pdf_data = Column(LargeBinary)         # stored PDF bytes
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

    owner = relationship("User", back_populates="job_applications")