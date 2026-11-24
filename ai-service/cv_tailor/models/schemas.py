from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal
from datetime import date as DateType, datetime
from pathlib import Path
from typing import Optional

ResumeTemplate = Literal["classic", "modern", "minimal", "serif", "executive", "technical", "compact", "sidebar"]
PortfolioDesign = Literal["editorial", "bento", "technical", "case-study", "executive", "bold-studio"]
PortfolioStack = Literal["nextjs", "vite-react", "astro", "sveltekit", "html", "custom"]
PortfolioDeployProvider = Literal["vercel", "cloudflare"]


class ConnectionPreference(BaseModel):
    model_config = {"extra": "forbid"}
    config_path: Optional[str] = Field(default=None, max_length=4096)

    @field_validator("config_path")
    @classmethod
    def local_config_file(cls, value):
        if value is not None:
            from pathlib import Path
            path = Path(value).expanduser()
            if not path.is_absolute() or any(part.startswith(".env") for part in path.parts) or path.suffix.lower() != ".json":
                raise ValueError("Use an absolute path to a nonsecret JSON setup file, never a URL or environment file.")
            return str(path)
        return value


class TrackingConnectionPreference(ConnectionPreference):
    provider: Literal["obsidian", "notion", "googlesheets", "markdown", "airtable", "hubspot", "gohighlevel", "custom"]


class CalendarConnectionPreference(ConnectionPreference):
    provider: Literal["googlecalendar", "outlook"]


class PortfolioPreference(BaseModel):
    model_config = {"extra": "forbid"}
    design: PortfolioDesign = "editorial"
    stack: PortfolioStack = "nextjs"
    deploy_provider: Optional[PortfolioDeployProvider] = None
    project_dir: Optional[str] = Field(default=None, max_length=4096)

    @field_validator("project_dir")
    @classmethod
    def local_project_directory(cls, value):
        if value is None:
            return None
        message = "Use an absolute local project directory without environment-file segments."
        try:
            path = Path(value).expanduser()
        except RuntimeError:
            raise ValueError(message) from None
        if (not path.is_absolute() or path.drive.startswith("\\\\") or "\x00" in value
                or any(part.casefold().startswith(".env") for part in path.parts)):
            raise ValueError(message)
        return str(path)


class PreferencesUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    revision: Optional[int] = Field(default=None, ge=1)
    resume_template: Optional[ResumeTemplate] = None
    tracking_connection: Optional[TrackingConnectionPreference] = None
    calendar_connections: List[CalendarConnectionPreference] = Field(default_factory=list, max_length=2)
    portfolio_preference: Optional[PortfolioPreference] = None

    @field_validator("calendar_connections")
    @classmethod
    def unique_calendars(cls, value):
        if len({connection.provider for connection in value}) != len(value):
            raise ValueError("Save one connection per calendar provider.")
        return value

    @field_validator("resume_template")
    @classmethod
    def require_template(cls, value):
        if value is None:
            raise ValueError("Choose a supported resume template.")
        return value

class Education(BaseModel):
    school_name: str = Field(max_length=150)
    course: str = Field(max_length=150)
    location: str = Field(max_length=100)
    description: Optional[str] = None
    date_range: Optional[str] = Field(default=None, max_length=50)

class Experience(BaseModel):
    job_title: str = Field(max_length=100)
    company: str = Field(max_length=100)
    location: str = Field(max_length=100)
    description: str
    date_range: str = Field(max_length=50)

class Project(BaseModel):
    name: str = Field(max_length=100)
    description: str
    date_range: str = Field(max_length=50)
    link: Optional[str] = Field(default=None, max_length=2048)

class Certification(BaseModel):
    name: str = Field(max_length=150)
    issuer: Optional[str] = Field(default=None, max_length=150)
    date_issued: Optional[str] = Field(default=None, max_length=50)

class SkillItem(BaseModel):
    skill_name: str = Field(max_length=50)
    # None means an older client did not provide a review decision.
    is_confirmed: Optional[bool] = None

class UserProfile(BaseModel):
    revision: Optional[int] = Field(default=None, ge=1)
    first_name: str = Field(max_length=50)
    last_name: str = Field(max_length=50)
    mobile_no: str = Field(max_length=20)
    email: str = Field(max_length=100)
    linkedin: Optional[str] = Field(default=None, max_length=255)
    github: Optional[str] = Field(default=None, max_length=255)
    portfolio: Optional[str] = Field(default=None, max_length=255)
    education: List[Education]
    experience: List[Experience]
    projects: List[Project]
    skills: List[SkillItem]
    certifications: List[Certification] = []
    preset_slug: Optional[str] = Field(default="blank", max_length=50)
    preferred_template: Optional[ResumeTemplate] = None

class GenerateRequest(BaseModel):
    email: str
    jd: str
    template_id: ResumeTemplate = "classic"
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

# A Spot Edit covers a contiguous run of Blocks inside one Section. The cap is
# mirrored in frontend/src/lib/resumeDraft.ts (resolveSelectionToBlocks).
MAX_SPOT_EDIT_BLOCKS = 6

class SpotEditBlock(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    order: int = Field(ge=0)
    kind: Literal["summary", "bullet", "detail"]
    section: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=2000)
    label: str = Field(default="", max_length=120)
    entry_title: Optional[str] = Field(default=None, max_length=150)
    entry_subtitle: Optional[str] = Field(default=None, max_length=150)

class SpotEditRequest(BaseModel):
    email: str
    instruction: str = Field(min_length=1, max_length=500)
    blocks: List[SpotEditBlock] = Field(min_length=1, max_length=MAX_SPOT_EDIT_BLOCKS)
    jd: str = ""

    @field_validator("instruction", "jd")
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        import re
        return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', v).strip()

    @model_validator(mode="after")
    def validate_block_run(self):
        if len({block.id for block in self.blocks}) != len(self.blocks):
            raise ValueError("A Spot Edit cannot contain duplicate Block addresses.")
        if len({block.section.strip().casefold() for block in self.blocks}) != 1:
            raise ValueError("A Spot Edit must stay within one Section.")
        orders = [block.order for block in self.blocks]
        if orders != list(range(orders[0], orders[0] + len(orders))):
            raise ValueError("A Spot Edit must contain one contiguous, document-ordered Block run.")
        return self

class JobApplicationCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=150)
    job_title: str = Field(min_length=1, max_length=150)
    job_url: Optional[str] = None
    job_source: Optional[str] = Field(default=None, max_length=250)
    short_description: Optional[str] = None
    job_description: Optional[str] = None  # add
    status: Literal["Saved", "Applied", "Interview", "Tech Test", "Offer", "Rejected", "Ghosted"] = "Saved"
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: Literal["High", "Medium", "Low"] = "Medium"
    notes: Optional[str] = None
    cover_letter: Optional[str] = None
    template_id: ResumeTemplate = "classic"

class JobApplicationUpdate(BaseModel):
    revision: Optional[int] = Field(default=None, ge=1)
    company_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    job_title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    job_url: Optional[str] = None
    job_source: Optional[str] = Field(default=None, max_length=250)
    is_archived: Optional[bool] = None
    short_description: Optional[str] = None
    job_description: Optional[str] = None  # add
    status: Optional[Literal["Saved", "Applied", "Interview", "Tech Test", "Offer", "Rejected", "Ghosted"]] = None
    date_applied: Optional[DateType] = None
    follow_up_date: Optional[DateType] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    priority: Optional[Literal["High", "Medium", "Low"]] = None
    notes: Optional[str] = None
    cover_letter: Optional[str] = None
    template_id: Optional[ResumeTemplate] = None

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
    template_id: ResumeTemplate = "classic"

    class Config:
        from_attributes = True

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
    code: str = Field(min_length=1, max_length=100000)
    stdin: Optional[str] = Field(default=None, max_length=64000)          # for problems that need input

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
    difficulty: Literal["Easy", "Medium", "Hard"] = "Medium"           # Easy / Medium / Hard
    count: int = Field(default=3, ge=1, le=5)

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
