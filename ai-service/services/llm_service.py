# LLM Service for Resume Generation
import re
import json
import os
from dotenv import load_dotenv
from models.schemas import UserProfile, Education, Experience, Project, Certification, SkillItem
from models import database_models as db_models
from services.templates import TEMPLATES
from services.preset_service import resolve_preset
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
                job_title=exp.job_title,
                company=exp.company,
                location=exp.location,
                description=exp.description,
                date_range=exp.date_range
            ) for exp in db_profile.experience
        ],
        projects=[
            Project(
                name=proj.name,
                description=proj.description,
                date_range=proj.date_range
            ) for proj in db_profile.projects
        ],
        skills=[SkillItem(skill_name=skill.skill_name) for skill in db_profile.skills],
        certifications=[
            Certification(
                name=cert.name,
                issuer=cert.issuer,
                date_issued=cert.date_issued
            ) for cert in db_profile.certifications
        ]
    )

def truncate_jd(jd: str, max_chars: int = 6000) -> str:
    if len(jd) > max_chars:
        return jd[:max_chars] + "... [truncated]"
    return jd

def _tokens(text: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9][a-z0-9+#.-]{2,}", text.lower())
        if token not in {"the", "and", "with", "for", "from", "that", "this", "using", "into", "your"}
    }


def retrieve_successful_evidence(profile: db_models.Profile, jd: str, db, limit: int = 12) -> list[dict]:
    """Retrieve plain-text evidence from Offer-linked historical resumes."""
    if not db or not profile:
        return []

    jobs = db.query(db_models.JobApplication).filter(
        db_models.JobApplication.user_id == profile.user_id,
        db_models.JobApplication.status == "Offer",
        db_models.JobApplication.latex_source.isnot(None),
    ).order_by(db_models.JobApplication.updated_at.desc()).all()

    jd_terms = _tokens(jd)
    candidates: list[dict] = []
    for job in jobs:
        bullets = re.findall(r"\\resumeItem\{([^{}]*)\}", job.latex_source or "")
        for bullet in bullets:
            text = re.sub(r"\\[a-zA-Z]+\*?(?:\{[^{}]*\})?", "", bullet)
            text = re.sub(r"[%{}]", "", text).strip()
            if not text:
                continue
            evidence_terms = _tokens(" ".join([text, job.job_title or "", job.company_name or ""]))
            score = len(jd_terms & evidence_terms)
            candidates.append({
                "source": f"{job.company_name} — {job.job_title}",
                "job_id": job.id,
                "text": text,
                "score": score,
            })

    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected = [item for item in candidates if item["score"] > 0][:limit]
    if not selected:
        selected = candidates[: min(limit, len(candidates))]
    return selected


def build_prompt(
    profile: UserProfile,
    jd: str,
    preset: dict | None = None,
    custom_role: str = "",
    historical_evidence: list[dict] | None = None,
) -> str:
    jd = truncate_jd(jd)
    
    if preset:
        persona_suffix = f" specializing in {preset['display_name']} roles"
    elif custom_role and custom_role != "blank":
        persona_suffix = f" specializing in {custom_role} roles"
    else:
        persona_suffix = " specializing in software developer roles"
    
    summary_rule = "- Summary: 3 sentences that directly speak to what THIS specific job needs. Mirror JD language."
    if preset:
        summary_rule += f" {preset['target_summary_prompt']}"
        
    action_verbs_rule = "- Lead bullets with strong action verbs appropriate to the role." if preset else "- Lead bullets with strong action verbs (Architected, Engineered, Designed, Implemented, etc.)."
    
    metric_prompts_rule = ""
    if preset:
        metric_prompts_rule = f"\n- Quantify achievements wherever possible. Use templates like these as the shape: {'; '.join(preset['metric_prompts'])}"
        
    num_exp = len(profile.experience) if profile.experience else 0
    num_proj = len(profile.projects) if profile.projects else 0
    is_short_profile = (num_exp + num_proj) <= 3

    if is_short_profile:
        page_filling_lever = """- PROFILE IS SHORT: The user has very few experiences and projects. To avoid large empty white spaces, you MUST write detailed, substantive descriptions.
- Write exactly 3-4 bullets per experience and project.
- Make each bullet detailed (1.5 to 2 lines long when rendered) explaining: WHAT was built, HOW it was built (technologies, architectural decisions), and the IMPACT (measurable results).
- Experience and project bullets must be robust, not short single-sentence statements."""
    else:
        page_filling_lever = preset['lever_guidance'] if preset else """- Projects are your main lever — write 3 detailed bullets per project, each 1.5-2 lines long.
- Each project bullet should explain: WHAT you built + HOW you built it + the IMPACT or result.
- Experience bullets should also be detailed — 1.5 lines each, not just one short sentence."""

    evidence_block = "\n".join(
        f"- Evidence {index + 1} [{item['source']}]: {item['text']}"
        for index, item in enumerate(historical_evidence or [])
    ) or "- No eligible historical evidence was found."

    return f"""
You are an elite resume writer and career strategist{persona_suffix}.

Your job is TWO things:
1. SELECTION — Pick only the BEST and MOST RELEVANT items from the profile that match the job description.
2. TAILORING — Rewrite every bullet point using the JD's exact keywords, terminology, and priorities.

JOB DESCRIPTION:
{jd}

SUCCESSFUL HISTORICAL EVIDENCE — OFFER-LINKED RESUMES ONLY:
{evidence_block}

USER PROFILE (full data — you SELECT from this):
{profile.model_dump_json()}

SELECTION RULES:
- Experience: Include ALL experience entries. Pick 2-3 bullets each, most relevant to JD.
- Projects: Pick TOP 2-3 projects most relevant to the JD. IGNORE irrelevant ones.
- Skills: Filter to only skills the JD cares about. Group into 2-3 meaningful categories.
- Certifications: Only include certifications relevant to the JD role.
{summary_rule}

TAILORING RULES:
- Use EXACT keywords from the JD in bullets (if JD says "data pipelines", use that phrase).
- Quantify achievements wherever possible (%, time saved, scale, users, etc.).
{action_verbs_rule}
- Never invent experience. Only reframe what exists using JD language.{metric_prompts_rule}
- Historical evidence is supporting evidence, not a source for invented facts. Reuse it only when it is truthful for the current profile.

PAGE RULES — CRITICAL:
- The resume MUST fit exactly one page. Never generate a second page.
- Prefer fewer, stronger bullets over overflowing content.
{page_filling_lever}
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
    name = f"{profile.first_name} {profile.last_name}".upper()

    contact_parts = []
    if profile.mobile_no:
        contact_parts.append(r"\faPhone\ " + profile.mobile_no)
    if profile.email:
        contact_parts.append(r"\href{mailto:" + profile.email + r"}{\faEnvelope\ \underline{" + profile.email + r"}}")
    if profile.linkedin:
        display = profile.linkedin.replace("https://", "").replace("http://", "")
        contact_parts.append(r"\href{" + profile.linkedin + r"}{\faLinkedinSquare\ \underline{" + display + r"}}")
    if profile.github:
        display = profile.github.replace("https://", "").replace("http://", "")
        contact_parts.append(r"\href{" + profile.github + r"}{\faGithub\ \underline{" + display + r"}}")

    contact_line = " $|$ ".join(contact_parts)

    portfolio_line = ""
    if profile.portfolio:
        display = profile.portfolio.replace("https://", "").replace("http://", "")
        portfolio_line = r"\\ \href{" + profile.portfolio + r"}{\faGlobe\ \underline{" + display + r"}}"

    return (
        r"\begin{center}" + "\n"
        r"    {\Huge \textbf{\textcolor{NavyBlue}{" + name + r"}}} \\ \vspace{2pt}" + "\n"
        r"    \small " + contact_line + portfolio_line + "\n"
        r"    \vspace{-12pt}" + "\n"
        r"\end{center}"
    )

def build_education(profile: UserProfile) -> str:
    lines = []
    if not profile.education:
        return r"    \item {No education history provided.}"
    for edu in profile.education:
        desc = edu.description or ""
        lines.append(r"    \resumeSubheading")
        lines.append(f"      {{{edu.school_name}}}{{{edu.location}}}")
        lines.append(f"      {{{edu.course}{' --- ' + desc if desc else ''}}}{{}}")
    return "\n".join(lines)

def build_experience(entries: list) -> str:
    lines = []
    if not entries:
        return r"    \item {No experience entries provided.}"
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
    if not entries:
        return r"      \item {No projects provided.}"
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
    if not skills_dict:
        return r"     \item {No skills provided.}"
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

def assemble_latex(profile: UserProfile, ai_content: dict, template_id: str = "classic") -> str:
    doc = TEMPLATES.get(template_id, TEMPLATES["classic"])

    # Relax vertical spacing in LaTeX template if the profile is short to naturally fill the page
    num_exp = len(ai_content.get("experience", []))
    num_proj = len(ai_content.get("projects", []))
    if (num_exp + num_proj) <= 3:
        doc = doc.replace(r"\vspace{-4pt}", r"\vspace{2pt}")
        doc = doc.replace(r"\vspace{-5pt}", r"\vspace{0pt}")
        doc = doc.replace(r"\vspace{-7pt}", r"\vspace{-3pt}")
        doc = doc.replace(r"\vspace{-2pt}", r"\vspace{1pt}")
        doc = doc.replace(r"\vspace{-16pt}", r"\vspace{-4pt}")
        doc = doc.replace(r"\vspace{-13pt}", r"\vspace{-2pt}")

    # Modern template heading overrides
    heading = build_heading(profile)
    if template_id == "modern":
        name = f"{profile.first_name} {profile.last_name}".upper()
        contact_parts = []
        if profile.mobile_no:
            contact_parts.append(r"\faPhone\ " + profile.mobile_no)
        if profile.email:
            contact_parts.append(r"\href{mailto:" + profile.email + r"}{\faEnvelope\ \underline{" + profile.email + r"}}")
        if profile.linkedin:
            display = profile.linkedin.replace("https://", "").replace("http://", "")
            contact_parts.append(r"\href{" + profile.linkedin + r"}{\faLinkedinSquare\ \underline{" + display + r"}}")
        if profile.github:
            display = profile.github.replace("https://", "").replace("http://", "")
            contact_parts.append(r"\href{" + profile.github + r"}{\faGithub\ \underline{" + display + r"}}")

        contact_line = " $|$ ".join(contact_parts)
        portfolio_line = ""
        if profile.portfolio:
            display = profile.portfolio.replace("https://", "").replace("http://", "")
            portfolio_line = r"\\ \href{" + profile.portfolio + r"}{\faGlobe\ \underline{" + display + r"}}"

        heading = (
            r"\begin{center}" + "\n"
            r"    {\Huge \textbf{\textcolor{primaryColor}{" + name + r"}}} \\ \vspace{4pt}" + "\n"
            r"    \small\color{textColor} " + contact_line + portfolio_line + "\n"
            r"    \vspace{-10pt}" + "\n"
            r"\end{center}"
        )

    doc = doc.replace("<<HEADING>>", heading)
    doc = doc.replace("<<SUMMARY>>", ai_content.get("summary", ""))
    doc = doc.replace("<<EDUCATION>>", build_education(profile))
    doc = doc.replace("<<EXPERIENCE>>", build_experience(ai_content.get("experience", [])))
    doc = doc.replace("<<PROJECTS>>", build_projects(ai_content.get("projects", [])))
    doc = doc.replace("<<SKILLS>>", build_skills(ai_content.get("skills", {})))
    doc = doc.replace("<<CERTIFICATIONS>>", build_certifications(ai_content.get("certifications", "")))
    return doc



def generate_latex_resume(db_profile: db_models.Profile, jd: str, template_id: str = "classic", preset_slug: str = "blank", db = None) -> str:
    profile = db_profile_to_schema(db_profile)
    
    preset_dict = None
    if db:
        preset = resolve_preset(db, preset_slug)
        if preset:
            preset_dict = preset.__dict__


    historical_evidence = retrieve_successful_evidence(db_profile, jd, db)
    prompt = build_prompt(profile, jd, preset_dict, custom_role=preset_slug, historical_evidence=historical_evidence)

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )

        raw = clean_json_response(response.text)
        ai_content = json.loads(raw)
        full_latex = assemble_latex(profile, ai_content, template_id)
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
6. The cover letter should start with a professional greeting (e.g., "Dear Hiring Manager," or "Dear [Company] Hiring Team,") and end with a professional sign-off including the user's name, portfolio link (reinaelyabut.dev).

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

def build_job_extraction_prompt(html: str) -> str:
    # Gemini 3.1 Flash has a 1M token context window. We can pass much larger HTML chunks securely.
    if len(html) > 800000:
        html = html[:800000]
        
    return f"""
You are an expert data extractor.

I am providing you with the raw HTML of a job posting.
Extract the following information:
- The Job Title
- The Company Name
- The Full Job Description (clean text, no HTML tags)

RAW HTML:
{html}

OUTPUT RULES:
1. Return ONLY valid JSON.
2. Structure:
{{
  "job_title": "string",
  "company_name": "string",
  "job_description": "string"
}}
3. If you cannot find a field, return null for it.
"""

def extract_job_details(html: str) -> dict:
    prompt = build_job_extraction_prompt(html)
    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )
        raw = clean_json_response(response.text)
        return json.loads(raw)
    except Exception as e:
        raise Exception(f"Failed to extract job details: {str(e)}")

def extract_profile_from_resume(text: str) -> dict:
    prompt = f"""
You are an expert resume parser. Extract the user's profile information from the following resume text.

RAW RESUME TEXT:
{text}

OUTPUT RULES:
1. Return ONLY valid JSON.
2. Structure exactly like this:
{{
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "mobile_no": "string",
  "linkedin": "string url",
  "github": "string url",
  "portfolio": "string url",
  "education": [
    {{"school_name": "string", "course": "string", "location": "string", "description": "string"}}
  ],
  "experience": [
    {{"job_title": "string", "company": "string", "location": "string", "date_range": "string", "description": "string"}}
  ],
  "projects": [
    {{"name": "string", "date_range": "string", "description": "string"}}
  ],
  "skills": [
    {{"skill_name": "string"}}
  ],
  "certifications": [
    {{"name": "string", "issuer": "string", "date_issued": "string"}}
  ]
}}
3. For missing data, omit the field or return an empty string/array.
4. Extract everything you can find. Make sure descriptions contain the bullet points combined.
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )
        raw = clean_json_response(response.text)
        return json.loads(raw)
    except Exception as e:
        raise Exception(f"Failed to parse resume: {str(e)}")
