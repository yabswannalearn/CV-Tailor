from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    mobile_no = Column(String(20))
    email = Column(String(100), unique=True, index=True)
    linkedin = Column(String(255))
    github = Column(String(255))
    portfolio = Column(String(255))
    summary = Column(Text)
    
    education = relationship("Education", back_populates="owner", cascade="all, delete")
    experience = relationship("Experience", back_populates="owner", cascade="all, delete")
    projects = relationship("Project", back_populates="owner", cascade="all, delete")
    skills = relationship("Skill", back_populates="owner", cascade="all, delete")

class Education(Base):
    __tablename__ = "education"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    school_name = Column(String(150))
    course = Column(String(150))
    location = Column(String(100))
    date_range = Column(String(50))
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
    tech_stack = Column(String(255))
    date_range = Column(String(50))
    owner = relationship("Profile", back_populates="projects")

class Skill(Base):
    __tablename__ = "skills"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"))
    skill_name = Column(String(50))
    owner = relationship("Profile", back_populates="skills")