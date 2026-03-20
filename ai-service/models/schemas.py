from pydantic import BaseModel, field_validator
from typing import List, Optional

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


