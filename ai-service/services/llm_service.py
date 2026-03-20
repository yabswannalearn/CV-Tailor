import requests
import re
from models.schemas import UserProfile, Education, Experience, Project, Certification
from models import database_models as db_models
from services.templates.jakes_resume import JAKES_RESUME

def clean_latex_output(raw: str) -> str:
    raw = re.sub(r"```(?:latex)?\s*", "", raw)
    raw = re.sub(r"```", "", raw)

    match = re.search(r"\\begin\{document\}", raw)
    if match:
        raw = raw[match.end():]

    raw = re.sub(r"\\end\{document\}", "", raw)
    return raw.strip()

def wrap_with_template(body: str, template: str) -> str:
    return template.replace("<<BODY>>", body)

def db_profile_to_schema(db_profile: db_models.Profile) -> UserProfile:
    return UserProfile(
        first_name=db_profile.first_name,
        last_name=db_profile.last_name,
        mobile_no=db_profile.mobile_no,
        email=db_profile.email,
        linkedin=db_profile.linkedin,
        github=db_profile.github,
        portfolio=db_profile.portfolio,
        education=[
            Education(
                school_name=edu.school_name,
                course=edu.course,
                location=edu.location,
                description=edu.description or ""
            ) for edu in db_profile.education
        ],
        experience=[
            Experience(
                name=exp.job_title,
                company=exp.company,
                location=exp.location,
                description=exp.description,
                date=exp.date_range
            ) for exp in db_profile.experience
        ],
        projects=[
            Project(
                name=proj.name,
                description=proj.description,
                date=proj.date_range
            ) for proj in db_profile.projects
        ],
        skills=[skill.skill_name for skill in db_profile.skills],
        certifications=[
            Certification(
                name=cert.name,
                issuer=cert.issuer,
                date_issued=cert.date_issued
            ) for cert in db_profile.certifications
        ]
    )

def truncate_jd(jd: str, max_chars: int = 1500) -> str:
    if len(jd) > max_chars:
        return jd[:max_chars] + "... [truncated]"
    return jd

def build_prompt(profile: UserProfile, jd: str) -> str:
    jd = truncate_jd(jd)

    template_instruction = r"""
    USE THIS EXACT LATEX STRUCTURE (Jake's Resume):

    HEADER (always first, contains ALL contact info):
    \begin{center}
        \textbf{\Huge \scshape John Doe} \\ \vspace{1pt}
        \small +63 912 345 6789 $|$
        \href{mailto:john@example.com}{john@example.com} $|$
        \href{https://linkedin.com/in/johndoe}{linkedin.com/in/johndoe} $|$
        \href{https://github.com/johndoe}{github.com/johndoe} $|$
        \href{https://johndoe.dev}{johndoe.dev}
    \end{center}

    SECTIONS (use only these):
    \section{Education}
    \resumeSubHeadingListStart
        \resumeSubheading{School Name}{Location}{Degree}{Dates}
    \resumeSubHeadingListEnd

    \section{Experience}
    \resumeSubHeadingListStart
        \resumeSubheading{Job Title}{Location}{Company Name}{Dates}
        \resumeItemListStart
            \resumeItem{Bullet point tailored to JD}
        \resumeItemListEnd
    \resumeSubHeadingListEnd

    \section{Projects}
    \resumeSubHeadingListStart
        \resumeProjectHeading{\textbf{Project Name} $|$ \emph{Tech Stack}}{Date}
        \resumeItemListStart
            \resumeItem{What you built and its impact}
        \resumeItemListEnd
    \resumeSubHeadingListEnd

    \section{Skills}
    \begin{itemize}[leftmargin=0.15in, label={}]
        \small{\item{
            \textbf{Languages}{: Python, Go} \\
            \textbf{Frameworks}{: FastAPI, Next.js} \\
            \textbf{Tools}{: PostgreSQL, Git}
        }}
    \end{itemize}

    \section{Certifications}
    \resumeSubHeadingListStart
        \resumeSubheading{Certification Name}{}{Issuer}{Date Issued}
    \resumeSubHeadingListEnd
    """
    cert_instruction = ""
    if profile.certifications:
        cert_list = ", ".join([f"{c.name} ({c.issuer}, {c.date_issued})" for c in profile.certifications if c.name])
        cert_instruction = f"\n    CERTIFICATIONS TO INCLUDE (mandatory): {cert_list}\n"


    strict_rules = r"""
    STRICT RULES:
    1. CRITICAL: Output ONLY body content — no \documentclass, no \usepackage, no \begin{document}, no \end{document}.
    2. Do NOT wrap output in markdown code fences.
    3. Start DIRECTLY with \begin{center} — nothing before it.
    4. NEVER create a "Contact Information" or "Professional Summary" section.
    5. Always wrap Education, Experience, Certifications inside \resumeSubHeadingListStart and \resumeSubHeadingListEnd.
    6. Tailor ALL bullet points to emphasize skills and keywords from the JD.
    7. Use the custom commands: \resumeSubheading, \resumeProjectHeading, \resumeItem.
    8. Escape all LaTeX special characters (%, &, $, #, _).
    9. If any field is missing, leave it BLANK — never write "N/A" or placeholder text.
    10. The output MUST fit on ONE page:
        - MAX 2 bullet points per experience entry
        - MAX 2 bullet points per project entry
        - Skills: max 3 categories, keep each line short
        - Be concise — every bullet must be 1 line max
    """ + cert_instruction + (r"""
    11. MANDATORY: If certifications are listed above, you MUST include a \section{Certifications} block.
        Use this format:
        \section{Certifications}
        \resumeSubHeadingListStart
            \resumeSubheading{Certification Name}{}{Issuer}{Date Issued}
        \resumeSubHeadingListEnd
    """ if profile.certifications else "")

    return (
        "You are an expert technical resume writer. Output must fit on exactly ONE page.\n"
        "Task: Rewrite the User Profile into a LaTeX resume body tailored to the Job Description.\n\n"
        f"JOB DESCRIPTION:\n{jd}\n\n"
        f"USER PROFILE:\n{profile.model_dump_json()}\n\n"
        f"{template_instruction}\n"
        f"{strict_rules}"
    )

def generate_latex_resume(db_profile: db_models.Profile, jd: str) -> str:
    profile = db_profile_to_schema(db_profile)
    prompt = build_prompt(profile, jd)

    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "qwen2.5:7b",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": 2800,
                    "temperature": 0.8,
                    "num_ctx": 3072
                }
            },
            timeout=300
        )
        response.raise_for_status()
        raw_latex = response.json().get("response", "")

        cleaned = clean_latex_output(raw_latex)
        full_latex = wrap_with_template(cleaned, JAKES_RESUME)

        return full_latex

    except requests.exceptions.Timeout:
        raise Exception("Ollama request timed out — is the model loaded?")
    except requests.exceptions.ConnectionError:
        raise Exception("Cannot connect to Ollama — is it running on port 11434?")
    except Exception as e:
        raise Exception(f"SERVICE ERROR: {str(e)}")