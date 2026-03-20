from pydantic import BaseModel
from typing import List, Optional

class Education(BaseModel):
    school_name: str
    course: str
    location: str

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

class GenerateRequest(BaseModel):
    profile: UserProfile
    job_description: str