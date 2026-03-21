from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import date as DateType, datetime
from typing import Optional

class Education(BaseModel):
    school_name: str
    course: str
    location: str
    description: Optional[str] = None

class Experience(BaseModel):
    name: str
    company: str
    location: str
    description: str
    date: str

class Project(BaseModel):
    name: str
    description: str
    date: str

class Certification(BaseModel):
    name: str
    issuer: Optional[str] = None
    date_issued: Optional[str] = None


class UserProfile(BaseModel):
    first_name: str
    last_name: str
    mobile_no: str
    email: str
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    education: List[Education]
    experience: List[Experience]
    projects: List[Project]
    skills: List[str]
    certifications: List[Certification] = []

class GenerateRequest(BaseModel):
    email: str
    jd: str

    @field_validator("jd")
    @classmethod
    def sanitize_jd(cls, v: str) -> str:
        # Remove invalid control characters that break JSON parsing
        import re
        v = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', v)
        # Normalize whitespace
        v = v.strip()
        return v

class RegisterRequest(BaseModel):
    email: str

class LoginRequest(BaseModel):
    email: str


class JobApplicationCreate(BaseModel):
    company_name: str
    job_title: str
    job_url: Optional[str] = None
    short_description: Optional[str] = None
    status: Optional[str] = "Saved"
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: Optional[str] = "Medium"
    notes: Optional[str] = None

class JobApplicationUpdate(BaseModel):
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    job_url: Optional[str] = None
    short_description: Optional[str] = None
    status: Optional[str] = None
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None

class JobApplicationCreate(BaseModel):
    company_name: str
    job_title: str
    job_url: Optional[str] = None
    short_description: Optional[str] = None
    job_description: Optional[str] = None  # add
    status: Optional[str] = "Saved"
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: Optional[str] = "Medium"
    notes: Optional[str] = None

class JobApplicationUpdate(BaseModel):
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    job_url: Optional[str] = None
    short_description: Optional[str] = None
    job_description: Optional[str] = None  # add
    status: Optional[str] = None
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None

class JobApplicationResponse(BaseModel):
    id: int
    company_name: str
    job_title: str
    job_url: Optional[str] = None
    short_description: Optional[str] = None
    job_description: Optional[str] = None  # add
    has_pdf: bool = False                   # add — don't send raw bytes to frontend
    pdf_generated_at: Optional[datetime] = None  # add
    status: str
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True
