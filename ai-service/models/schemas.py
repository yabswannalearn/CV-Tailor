from pydantic import BaseModel, field_validator
from typing import List, Optional, Literal
from datetime import date as DateType, datetime
from typing import Optional

class Education(BaseModel):
    school_name: str
    course: str
    location: str
    description: Optional[str] = None

class Experience(BaseModel):
    job_title: str
    company: str
    location: str
    description: str
    date_range: str

class Project(BaseModel):
    name: str
    description: str
    date_range: str

class Certification(BaseModel):
    name: str
    issuer: Optional[str] = None
    date_issued: Optional[str] = None

class SkillItem(BaseModel):
    skill_name: str

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
    skills: List[SkillItem]
    certifications: List[Certification] = []
    preset_slug: Optional[str] = "blank"

class GenerateRequest(BaseModel):
    email: str
    jd: str
    template_id: str = "classic"
    preset_slug: str = "blank"

    @field_validator("jd")
    @classmethod
    def sanitize_jd(cls, v: str) -> str:
        # Remove invalid control characters that break JSON parsing
        import re
        v = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', v)
        # Normalize whitespace
        v = v.strip()
        return v

class GenerateCoverLetterRequest(BaseModel):
    email: str
    jd: str
    company_name: str

    @field_validator("jd")
    @classmethod
    def sanitize_jd(cls, v: str) -> str:
        # Remove invalid control characters
        import re
        v = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', v)
        v = v.strip()
        return v

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str


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
    cover_letter: Optional[str] = None
    template_id: Literal["classic", "modern"] = "classic"

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
    cover_letter: Optional[str] = None
    template_id: Optional[Literal["classic", "modern"]] = None

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
    cover_letter: Optional[str] = None
    template_id: Literal["classic", "modern"] = "classic"

    class Config:
        from_attributes = True

class InterviewAnalyzeRequest(BaseModel):
    question: str
    answer: str
    job_title: str
    jd: Optional[str] = None


class DeliveryMetrics(BaseModel):
    eye_contact_pct: Optional[float] = None    # 0-100
    avg_smile: Optional[float] = None          # 0-1
    blink_rate: Optional[float] = None         # blinks per minute
    posture_score: Optional[float] = None      # 0-1
    answer_duration_seconds: Optional[int] = None

class InterviewAnalyzeRequest(BaseModel):
    question: str
    answer: str
    job_title: str
    jd: Optional[str] = None
    delivery: Optional[DeliveryMetrics] = None  # optional — works without MediaPipe too

class CodeRunRequest(BaseModel):
    code: str
    stdin: Optional[str] = None          # for problems that need input

class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    execution_time_ms: int
    timed_out: bool

class CodeHintRequest(BaseModel):
    problem_title: str
    problem_description: str
    current_code: str
    hint_level: int = 1                  # 1 = subtle, 2 = more direct, 3 = near-solution

class CodeReviewRequest(BaseModel):
    problem_title: str
    problem_description: str
    code: str
    output: Optional[str] = None

class CodeExplainErrorRequest(BaseModel):
    code: str
    error: str
    problem_title: Optional[str] = None

class CodeGenerateRequest(BaseModel):
    job_title: str
    jd: str
    difficulty: str = "Medium"           # Easy / Medium / Hard
    count: int = 3

class PresetListItem(BaseModel):
    slug: str
    display_name: str
    recommended_template: str

class PresetDetail(BaseModel):
    slug: str
    display_name: str
    target_summary_prompt: str
    core_skills_bank: List[str]
    metric_prompts: List[str]
    section_order: List[str]
    recommended_template: str
    lever_guidance: str
