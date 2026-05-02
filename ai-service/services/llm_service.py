import re
import json
import os
from dotenv import load_dotenv
from models.schemas import UserProfile, Education, Experience, Project, Certification
from models import database_models as db_models
from services.templates.jakes_resume import JAKES_RESUME
from google import genai

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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

    return f"""
You are an elite technical resume writer and career strategist.

Your job is TWO things:
1. SELECTION — Pick only the BEST and MOST RELEVANT items from the profile that match the job description.
2. TAILORING — Rewrite every bullet point using the JD's exact keywords, terminology, and priorities.

JOB DESCRIPTION:
{jd}

USER PROFILE (full data — you SELECT from this):
{profile.model_dump_json()}

SELECTION RULES:
- Experience: Include ALL experience entries. Pick 2-3 bullets each, most relevant to JD.
- Projects: Pick TOP 2-3 projects most relevant to the JD. IGNORE irrelevant ones.
- Skills: Filter to only skills the JD cares about. Group into 2-3 meaningful categories.
- Certifications: Only include certifications relevant to the JD role.
- Summary: 3 sentences that directly speak to what THIS specific job needs. Mirror JD language.

TAILORING RULES:
- Use EXACT keywords from the JD in bullets (if JD says "data pipelines", use that phrase).
- Quantify achievements wherever possible (%, time saved, scale, users, etc.).
- Lead bullets with strong action verbs (Architected, Engineered, Designed, Implemented, etc.).
- Never invent experience. Only reframe what exists using JD language.

PAGE FILLING RULES — CRITICAL:
- The resume MUST fill close to one full page. No large empty space at the bottom.
- Projects are your main lever — write 3 detailed bullets per project, each 1.5-2 lines long.
- Each project bullet should explain: WHAT you built + HOW you built it + the IMPACT or result.
- Experience bullets should also be detailed — 1.5 lines each, not just one short sentence.
- Summary should be 3 full sentences.
- If there is still space, add a 3rd project from the profile if relevant.
- Skills section should have 2-3 categories with 5-7 items each.
- Do NOT add fake content. Expand and elaborate on what EXISTS in the profile using JD context.

OUTPUT RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no code fences.
2. Plain text only inside JSON — NO backslashes, NO LaTeX commands.
3. Write normal dashes: "2024 - 2025" not "2024 -- 2025"
4. Certifications: pipe-separated string like "Cert 1 | Cert 2"
5. Leave fields blank if data is missing — never invent data.

Return this exact JSON structure:
{{
  "summary": "3 full sentences speaking directly to THIS job using JD language and keywords",
  "experience": [
    {{
      "title": "Job Title",
      "company": "Company",
      "location": "Location",
      "date": "Start - End",
      "bullets": [
        "Detailed bullet 1.5-2 lines long with JD keywords and quantified impact",
        "Detailed bullet 1.5-2 lines long",
        "Detailed bullet 1.5-2 lines long"
      ]
    }}
  ],
  "projects": [
    {{
      "name": "Project name",
      "tech": "Tech stack",
      "date": "Year",
      "bullets": [
        "Detailed bullet explaining what you built, how, and the measurable impact — 1.5 to 2 lines long",
        "Detailed bullet on a specific technical challenge solved and the approach taken",
        "Detailed bullet on results, scale, or adoption — with numbers if possible"
      ]
    }}
  ],
  "skills": {{
    "JD-relevant category 1": "skill1, skill2, skill3, skill4, skill5",
    "JD-relevant category 2": "skill1, skill2, skill3, skill4",
    "JD-relevant category 3": "skill1, skill2, skill3"
  }},
  "certifications": "Relevant cert 1 | Relevant cert 2 | Relevant cert 3"
}}
"""

def escape_latex(text: str) -> str:
    if not text:
        return text
    replacements = [
        ("\\", r"\textbackslash{}"),
        ("%", r"\%"),
        ("&", r"\&"),
        ("$", r"\$"),
        ("#", r"\#"),
        ("_", r"\_"),
        # Remove { } from escaping — they break LaTeX commands
        ("~", r"\textasciitilde{}"),
        ("^", r"\^{}"),
        # Note: apostrophe ' is fine in LaTeX, don't escape it
    ]
    for char, escaped in replacements:
        text = text.replace(char, escaped)
    return text

def clean_json_response(raw: str) -> str:
    # Strip markdown fences
    raw = re.sub(r"```(?:json)?\s*", "", raw)
    raw = re.sub(r"```", "", raw)
    # Find the JSON object boundaries
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start != -1 and end > start:
        raw = raw[start:end]
    return raw.strip()

def build_heading(profile: UserProfile) -> str:
    name = f"{profile.first_name} {profile.last_name}"

    contact_parts = []
    if profile.mobile_no:
        contact_parts.append(r"    \small \raisebox{-0.1\height}\faPhone\ " + profile.mobile_no)
    if profile.email:
        contact_parts.append(r"    \href{mailto:" + profile.email + r"}{\raisebox{-0.2\height}\faEnvelope\ \underline{" + profile.email + r"}}")
    if profile.linkedin:
        display = profile.linkedin.replace("https://", "").replace("http://", "")
        contact_parts.append(r"    \href{" + profile.linkedin + r"}{\raisebox{-0.2\height}\faLinkedin\ \underline{" + display + r"}}")
    if profile.github:
        display = profile.github.replace("https://", "").replace("http://", "")
        contact_parts.append(r"    \href{" + profile.github + r"}{\raisebox{-0.2\height}\faGithub\ \underline{" + display + r"}}")
    if profile.portfolio:
        display = profile.portfolio.replace("https://", "").replace("http://", "")
        contact_parts.append(r"    \href{" + profile.portfolio + r"}{\raisebox{-0.2\height}\faGlobe\ \underline{" + display + r"}}")

    contact_line = " ~\n".join(contact_parts)

    return (
        r"\begin{center}" + "\n"
        r"    {\Huge \scshape \textbf{\textcolor{NavyBlue}{" + name + r"}}} \\ \vspace{1pt}" + "\n"
        + contact_line + "\n"
        + r"    \vspace{-8pt}" + "\n"
        + r"\end{center}"
    )

def build_education(profile: UserProfile) -> str:
    lines = []
    for edu in profile.education:
        desc = edu.description or ""
        lines.append(r"    \resumeSubheading")
        lines.append(f"      {{{edu.school_name}}}{{{edu.location}}}")
        lines.append(f"      {{{edu.course}{' --- ' + desc if desc else ''}}}{{}}")
    return "\n".join(lines)

def build_experience(entries: list) -> str:
    lines = []
    for exp in entries:
        lines.append(r"    \resumeSubheading")
        lines.append(f"      {{{escape_latex(exp['company'])}}}{{{escape_latex(exp['location'])}}}")
        lines.append(f"      {{{escape_latex(exp['title'])}}}{{{escape_latex(exp['date'])}}}")
        lines.append(r"      \resumeItemListStart")
        for b in exp.get("bullets", []):
            lines.append(f"        \\resumeItem{{{escape_latex(b)}}}")
        lines.append(r"      \resumeItemListEnd")
        lines.append("")
    return "\n".join(lines)

def build_projects(entries: list) -> str:
    lines = []
    for proj in entries:
        lines.append(r"      \resumeProjectHeading")
        lines.append(f"          {{\\textbf{{{escape_latex(proj['name'])}}} $|$ \\emph{{{escape_latex(proj['tech'])}}}}}{{\\textbf{{\\small {escape_latex(proj['date'])}}}}}")
        lines.append(r"          \resumeItemListStart")
        for b in proj.get("bullets", []):
            lines.append(f"            \\resumeItem{{{escape_latex(b)}}}")
        lines.append(r"          \resumeItemListEnd")
        lines.append(r"          \vspace{-13pt}")
        lines.append("")
    return "\n".join(lines)

def build_skills(skills_dict: dict) -> str:
    lines = []
    for category, items in skills_dict.items():
        lines.append(f"     \\textbf{{{escape_latex(category)}}}{{: {escape_latex(items)}}} \\\\")
    return "\n".join(lines)

def build_certifications(cert_line: str) -> str:
    if not cert_line or not cert_line.strip():
        return ""
    # Convert pipe separators to LaTeX pipe
    cert_line = cert_line.replace(" | ", " $|$ ")
    return r"""\section{Certifications}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     """ + cert_line + r"""
    }}
 \end{itemize}"""

def assemble_latex(profile: UserProfile, ai_content: dict) -> str:
    doc = JAKES_RESUME
    doc = doc.replace("<<HEADING>>", build_heading(profile))
    doc = doc.replace("<<SUMMARY>>", ai_content.get("summary", ""))
    doc = doc.replace("<<EDUCATION>>", build_education(profile))
    doc = doc.replace("<<EXPERIENCE>>", build_experience(ai_content.get("experience", [])))
    doc = doc.replace("<<PROJECTS>>", build_projects(ai_content.get("projects", [])))
    doc = doc.replace("<<SKILLS>>", build_skills(ai_content.get("skills", {})))
    doc = doc.replace("<<CERTIFICATIONS>>", build_certifications(ai_content.get("certifications", "")))
    return doc

def clean_json_response(raw: str) -> str:
    # Strip markdown fences if present
    raw = re.sub(r"```(?:json)?\s*", "", raw)
    raw = re.sub(r"```", "", raw)
    return raw.strip()

def generate_latex_resume(db_profile: db_models.Profile, jd: str) -> str:
    profile = db_profile_to_schema(db_profile)
    prompt = build_prompt(profile, jd)

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )

        raw = clean_json_response(response.text)
        ai_content = json.loads(raw)
        full_latex = assemble_latex(profile, ai_content)
        return full_latex

    except json.JSONDecodeError as e:
        raise Exception(f"AI returned invalid JSON: {str(e)}")
    except Exception as e:
        raise Exception(f"SERVICE ERROR: {str(e)}")

def build_cover_letter_prompt(profile: UserProfile, jd: str, company: str) -> str:
    jd = truncate_jd(jd)

    return f"""
You are an expert career coach and technical cover letter writer.

Your job is to write a highly tailored, compelling, and professional cover letter for the user.
The cover letter MUST be written from the perspective of the user, applying to the specified company for the job described.

JOB DESCRIPTION:
{jd}

COMPANY:
{company}

USER PROFILE:
{profile.model_dump_json()}

RULES:
1. Write in a confident, professional, yet conversational tone.
2. Directly address how the user's specific skills and experiences from their profile make them a perfect fit for the requirements in the job description.
3. Keep it concise—about 3 to 4 paragraphs.
4. Do NOT invent any skills or experiences not present in the user profile.
5. Format the output as plain text (or markdown), with appropriate spacing for paragraphs. Do not output JSON.
6. The cover letter should start with a professional greeting (e.g., "Dear Hiring Manager," or "Dear [Company] Hiring Team,") and end with a professional sign-off including the user's name.

Return ONLY the cover letter text.
"""

def generate_cover_letter(db_profile: db_models.Profile, jd: str, company_name: str) -> str:
    profile = db_profile_to_schema(db_profile)
    prompt = build_cover_letter_prompt(profile, jd, company_name)

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        raise Exception(f"SERVICE ERROR: {str(e)}")