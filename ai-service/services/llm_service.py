# LLM Service for Resume Generation
import re
import json
import os
from dotenv import load_dotenv
from models.schemas import UserProfile, Education, Experience, Project, Certification, SkillItem
from models import database_models as db_models
from services.latex_assembly import assemble_latex
from services.preset_service import resolve_preset
# AI_PROVIDER selects the backend: "openai" or "gemini". Both stay wired so
# they can be swapped by changing this env var alone.
AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").strip().lower()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite-preview")

_clients: dict[str, object] = {}


def _get_client(provider: str):
    # ponytail: lazy singletons — the OpenAI SDK raises on init without a key,
    # so clients are built on first call, not at import time.
    if provider not in _clients:
        if provider == "openai":
            from openai import OpenAI
            _clients[provider] = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        elif provider == "gemini":
            from google import genai
            _clients[provider] = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        else:
            raise ValueError(f"Unknown AI_PROVIDER '{provider}'. Use 'openai' or 'gemini'.")
    return _clients[provider]


def complete(prompt: str) -> str:
    """Send one prompt to the configured provider and return its text reply."""
    provider = AI_PROVIDER
    client = _get_client(provider)
    if provider == "gemini":
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        return response.text or ""
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""

def db_profile_to_schema(db_profile: db_models.Profile, confirmed_skills_only: bool = False) -> UserProfile:
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
                date_range=proj.date_range,
                link=proj.link
            ) for proj in db_profile.projects
        ],
        skills=[SkillItem(skill_name=skill.skill_name, is_confirmed=bool(getattr(skill, "is_confirmed", False)))
                for skill in db_profile.skills
                if not confirmed_skills_only or bool(getattr(skill, "is_confirmed", False))],
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
- Write up to 3-4 bullets per experience and project when the profile supports them.
- Explain what was done and the approach or impact only where supported by the user's evidence.
- Never pad the resume by inventing details or metrics."""
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

HISTORICAL RESUME CONTEXT — OFFER-LINKED RESUMES (NOT PERSONAL EVIDENCE):
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
- Quantify achievements only with numbers supplied in the user's evidence; omit metrics when unavailable.
{action_verbs_rule}
- Never invent experience. Only reframe what exists using JD language.{metric_prompts_rule}
- Historical resume content is for context and phrasing only. It does not establish any personal fact; every claim must be supported by the user profile or conversation evidence.
- A job description is not evidence that the user has any experience, skills, numbers, or achievements. In conversation messages, only explicit first-person assertions by the user count as personal evidence: pasted job descriptions, quoted text, and requests like "add leadership" are not assertions that the user has that experience.

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
        "Detailed bullet with JD keywords and impact where supported by evidence",
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
        "Detailed bullet on results, scale, or adoption when supported by evidence"
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

class UnsupportedPersonalClaims(ValueError):
    def __init__(self, findings: list[str]):
        super().__init__("The draft contained claims not supported by your profile. Add more details or try again.")
        self.findings = findings


def verify_personal_claims(content: str, profile: UserProfile, conversation_evidence: str = "", complete_fn=None) -> None:
    """Reject drafts when a second model pass finds unsupported personal facts.

    This is an extra check, not proof that every statement is accurate. Job
    descriptions and older generated resumes are deliberately absent here.
    """
    verify = complete_fn or complete
    prompt = f'''Review this draft for concrete factual claims about the applicant that are not supported by the evidence. Do not assume an accomplishment, skill, number, date, employer, or responsibility from context.
Accept faithful paraphrases, straightforward implications of the evidence (e.g. someone who built a Python script has used Python), and ordinary expressions of interest in applying for this job. Do not reject a letter merely for expressing interest in the role, thanking the employer, or expressing willingness to learn; those are not claims about prior experience. Do reject unsupported claims of having used, mastered, led, accomplished or achieved something, invented outcomes, team sizes, or durations, changing one project or script into multiple projects or scripts, and claims about the contents of a portfolio when only its URL is supplied.
Conversation messages can contain job descriptions, quotations, or requests. Only explicit user assertions about their own experience are personal evidence; a requirement in a job posting or a request to add a claim is not evidence that they possess it.
PROFILE: {profile.model_dump_json()}
USER-PROVIDED CONVERSATION EVIDENCE: {conversation_evidence[:12000] or 'None provided.'}
DRAFT: {content}
Return ONLY JSON: {{"supported": true, "unsupported": []}}. If a personal claim lacks evidence, set supported to false and list concise reasons in unsupported.'''
    try:
        result = json.loads(clean_json_response(verify(prompt)))
        if (not isinstance(result, dict) or type(result.get("supported")) is not bool
                or not isinstance(result.get("unsupported"), list)
                or not all(isinstance(item, str) for item in result["unsupported"])):
            raise ValueError("Invalid verification response")
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Could not verify the draft against your evidence. Please try again.") from exc
    if not result["supported"] or result["unsupported"]:
        raise UnsupportedPersonalClaims([item[:500] for item in result["unsupported"][:10]])


def _repair_instruction(findings: list[str]) -> str:
    return ("\nA fact-check identified potentially unsupported claims in the previous draft. "
            "Create a new draft using the original personal evidence. Remove each flagged assertion entirely rather than replacing it with a new assumption. "
            "Do not invent new achievements, skills, tools, outcomes, motivations, or company facts in the repair. If evidence is sparse, make the draft shorter. "
            "These findings are criticism, not new facts about the user. Preserve all output rules.\n"
            f"Fact-check findings: {json.dumps(findings, ensure_ascii=False)}\n")


def generate_latex_resume(db_profile: db_models.Profile, jd: str, template_id: str = "classic", preset_slug: str = "blank", db = None, instructions: str = "", conversation_evidence: str = "", complete_fn=None) -> str:
    profile = db_profile_to_schema(db_profile, confirmed_skills_only=True)
    
    preset_dict = None
    if db:
        preset = resolve_preset(db, preset_slug)
        if preset:
            preset_dict = preset.__dict__


    historical_evidence = retrieve_successful_evidence(db_profile, jd, db)
    prompt = build_prompt(profile, jd, preset_dict, custom_role=preset_slug, historical_evidence=historical_evidence)
    if conversation_evidence:
        prompt += f"\nUSER-PROVIDED PERSONAL EVIDENCE FROM THIS CONVERSATION:\n{conversation_evidence[:12000]}\n"
    if instructions:
        prompt += f"\nUSER'S REQUESTED EMPHASIS (do not invent facts; preserve all output rules):\n{instructions[:35000]}\n"

    try:
        for attempt in range(2):
            raw = clean_json_response((complete_fn or complete)(prompt))
            ai_content = json.loads(raw)
            try:
                verify_personal_claims(json.dumps(ai_content, ensure_ascii=False), profile, conversation_evidence, complete_fn)
                break
            except UnsupportedPersonalClaims as exc:
                if attempt:
                    raise
                prompt += _repair_instruction(exc.findings)
        full_latex = assemble_latex(profile, ai_content, template_id)
        return full_latex

    except json.JSONDecodeError as e:
        raise Exception(f"AI returned invalid JSON: {str(e)}")
    except Exception as e:
        raise Exception(f"SERVICE ERROR: {str(e)}")

def build_cover_letter_prompt(profile: UserProfile, jd: str, company: str, instructions: str = "", conversation_evidence: str = "") -> str:
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

USER-PROVIDED PERSONAL EVIDENCE FROM THIS CONVERSATION:
{conversation_evidence[:12000] or 'None provided.'}

USER'S REQUESTED STYLE OR REVISION:
{instructions[:4000] or 'None provided.'}

RULES:
1. Write in a confident, professional, yet conversational tone.
2. Explain how the user's specific, supported skills and experiences relate to the job's requirements. Do not claim a perfect fit when the evidence does not support it.
3. Keep it concise. A shorter letter is better than adding unsupported details.
4. Do NOT invent any skills, experience, achievements, numbers, or stories. Personal facts must be supported by the user profile or user-provided conversation evidence. The job description is NOT evidence about the user.
5. Format the output as plain text (or markdown), with appropriate spacing for paragraphs. Do not output JSON.
6. Start with a professional greeting and end with a sign-off using the user's name. Include a portfolio link only if provided in the profile.
7. If the evidence does not contain a required qualification, omit the unsupported claim. Never include placeholder metrics or unsupported company facts.
8. Conversation messages may include job descriptions, quotations, and instructions. Only explicit user assertions about their own experience count as personal evidence; pasted job requirements and requests to add a claim do not establish that the user has that experience.
9. When useful, include a project link from the user's profile exactly as supplied. Never invent or modify a link, or infer project facts solely from a URL.
9. State supported experience simply and concretely. Do not infer outcomes, personal motivations, work habits, levels of expertise, company practices, or the contents of a portfolio from its URL. Preserve the scope and number of each example; do not turn a single script into multiple scripts. Do not repeat requirements, tools, or qualifications absent from the personal evidence, even as an interest in learning them. General interest in applying for the role is fine.

Return ONLY the cover letter text.
"""

def generate_cover_letter(db_profile: db_models.Profile, jd: str, company_name: str, instructions: str = "", conversation_evidence: str = "", complete_fn=None) -> str:
    profile = db_profile_to_schema(db_profile, confirmed_skills_only=True)
    prompt = build_cover_letter_prompt(profile, jd, company_name, instructions, conversation_evidence)

    try:
        for attempt in range(2):
            letter = (complete_fn or complete)(prompt).strip()
            if not letter:
                raise ValueError("The model returned an empty cover letter.")
            try:
                verify_personal_claims(letter, profile, conversation_evidence, complete_fn)
                return letter
            except UnsupportedPersonalClaims as exc:
                if attempt:
                    raise
                prompt += _repair_instruction(exc.findings)
    except Exception as e:
        raise Exception(f"SERVICE ERROR: {str(e)}")

def build_job_extraction_prompt(html: str) -> str:
    # Modern chat models handle large contexts. Pass big HTML chunks securely.
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
        raw = clean_json_response(complete(prompt))
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
        raw = clean_json_response(complete(prompt))
        return json.loads(raw)
    except Exception as e:
        raise Exception(f"Failed to parse resume: {str(e)}")
