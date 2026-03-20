from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

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