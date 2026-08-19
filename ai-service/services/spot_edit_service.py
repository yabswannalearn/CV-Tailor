"""Spot Edits: instruction-driven rewrites of individual resume Blocks.

A Spot Edit rewrites the Blocks the user selected and nothing else. Like every
other AI path in this codebase, the model returns plain text only — LaTeX is
assembled elsewhere (see latex_assembly.py), which is what keeps a rewrite
structurally incapable of breaking compilation.
"""
import json
import re

from models import database_models as db_models
from models.schemas import SpotEditBlock, SpotEditRequest
from services.llm_service import clean_json_response, client, truncate_jd

MODEL = "gemini-3.1-flash-lite-preview"

# A rewrite that grows unchecked breaks the one-page rule. Give the model a hard
# per-Block ceiling rather than trying to repair overflow after the fact.
LENGTH_TOLERANCE = 1.15
LENGTH_HEADROOM = 20
NUMBER_TOKEN = re.compile(r"(?<![\w])(?:[$£€¥]\s*)?\d[\d,]*(?:\.\d+)?%?(?![\w])")
PLACEHOLDER = re.compile(r"\[(?:x|number|metric|value)\]|\b(?:tbd|todo)\b", re.IGNORECASE)
METRIC_INTENT = re.compile(r"\b(?:metric|number|numeric|quantif|percentage|percent|figure|amount)\w*\b|%", re.IGNORECASE)


def _length_budget(text: str) -> int:
    return max(len(text) + LENGTH_HEADROOM, int(len(text) * LENGTH_TOLERANCE))


def _match_entry(profile: db_models.Profile, title: str) -> str:
    """The profile row a Block was originally derived from — its only source of truth."""
    needle = title.strip().lower()
    if not needle:
        return ""
    for experience in profile.experience:
        if (experience.company or "").strip().lower() == needle:
            return "; ".join(filter(None, [
                getattr(experience, "company", ""),
                getattr(experience, "job_title", ""),
                getattr(experience, "location", ""),
                getattr(experience, "date_range", ""),
                getattr(experience, "description", ""),
            ]))
    for project in profile.projects:
        if (project.name or "").strip().lower() == needle:
            return "; ".join(filter(None, [
                getattr(project, "name", ""),
                getattr(project, "date_range", ""),
                getattr(project, "description", ""),
            ]))
    return ""


def _grounding(profile: db_models.Profile, block: SpotEditBlock) -> str:
    if block.kind == "bullet":
        source = _match_entry(profile, block.entry_title or "")
        return source or "No profile row matched this bullet. Do not introduce new facts."

    if block.kind == "summary":
        roles = "; ".join(
            f"{experience.job_title} at {experience.company}" for experience in profile.experience
        ) or "none recorded"
        skills = ", ".join(skill.skill_name for skill in profile.skills) or "none recorded"
        return f"Roles held: {roles}. Skills: {skills}."

    if block.label:
        skills = ", ".join(skill.skill_name for skill in profile.skills) or "none recorded"
        return f"The user's full declared skill list: {skills}. Use only these."

    certifications = ", ".join(
        certification.name for certification in profile.certifications
    ) or "none recorded"
    return f"The user's certifications: {certifications}. Use only these."


def build_spot_edit_prompt(profile: db_models.Profile, data: SpotEditRequest) -> str:
    jd = truncate_jd(data.jd) if data.jd else "No job description was supplied."

    items = []
    for block in data.blocks:
        location = block.section
        if block.entry_title:
            location += f" — {block.entry_title}"
            if block.entry_subtitle:
                location += f" ({block.entry_subtitle})"
        if block.label:
            location += f" — {block.label}"

        items.append(
            f"""
ID: {block.id}
LOCATION: {location}
CURRENT TEXT: {block.text}
SOURCE OF TRUTH FROM THE USER'S PROFILE: {_grounding(profile, block)}
MAX CHARACTERS: {_length_budget(block.text)}
""".strip()
        )

    blocks_block = "\n\n".join(items)

    return f"""
You are editing specific, already-finished Blocks of a resume. You are NOT rewriting the resume.

THE USER'S INSTRUCTION FOR THESE BLOCKS:
{data.instruction}

JOB DESCRIPTION THE RESUME IS TAILORED TO:
{jd}

BLOCKS TO REWRITE ({len(data.blocks)} total):
{blocks_block}

RULES — ALL ARE MANDATORY:
1. Rewrite ONLY the Blocks listed above. Return exactly {len(data.blocks)} items with exactly the IDs given, in the same order.
2. NEVER invent a fact. Above all, never invent a number, percentage, duration, team size, or currency amount. Every concrete claim must be traceable to that part's SOURCE OF TRUTH or its CURRENT TEXT.
3. If the instruction asks for information the source of truth does not contain, apply the SPIRIT of the instruction without fabricating the missing data, and explain the gap in "note". Example: asked to add a percentage that does not exist, make the outcome sharper and more specific instead, then note that no figure was available.
4. NEVER output a placeholder such as [X], [NUMBER], or TBD. Placeholders are not acceptable output.
5. Stay within each Block's MAX CHARACTERS. The resume must still fit on one page.
6. Plain text only. No LaTeX, no backslashes, no markdown, no bullet characters, no surrounding quotes.
7. Use the job description's vocabulary where it is honest to do so.
8. Keep the user's voice and tense. Do not add a trailing period to a Block that had none.
9. Leave "note" as an empty string when the instruction was fully satisfied.

Return ONLY this JSON — no code fences, no commentary:
{{
  "blocks": [
    {{"id": "<the exact id given>", "text": "<the rewritten plain text>", "note": ""}}
  ]
}}
""".strip()


def rewrite_blocks(profile: db_models.Profile, data: SpotEditRequest) -> list[dict]:
    prompt = build_spot_edit_prompt(profile, data)

    response = client.models.generate_content(model=MODEL, contents=prompt)
    try:
        payload = json.loads(clean_json_response(response.text))
    except json.JSONDecodeError as exc:
        raise ValueError(f"AI returned invalid JSON: {exc}") from exc

    returned = payload.get("blocks")
    if not isinstance(returned, list):
        raise ValueError("AI response did not contain a 'blocks' list.")

    by_id = {}
    returned_ids = []
    for item in returned:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            returned_ids.append(item["id"])
            by_id[item["id"]] = item

    expected_ids = [block.id for block in data.blocks]
    if len(returned_ids) != len(expected_ids) or len(set(returned_ids)) != len(returned_ids) or set(returned_ids) != set(expected_ids):
        raise ValueError("AI response must contain exactly one rewrite for every requested Block.")

    results = []
    for block in data.blocks:
        item = by_id.get(block.id)
        text = (item or {}).get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"AI did not return a rewrite for '{block.id}'.")

        text = " ".join(text.split())
        if len(text) > _length_budget(block.text):
            raise ValueError(f"AI rewrite for '{block.id}' exceeded its length budget.")
        if "\\" in text or PLACEHOLDER.search(text):
            raise ValueError(f"AI rewrite for '{block.id}' was not valid plain resume text.")

        source = f"{block.text} {_grounding(profile, block)}"
        allowed_numbers = set(NUMBER_TOKEN.findall(source))
        introduced_numbers = set(NUMBER_TOKEN.findall(text)) - allowed_numbers
        if introduced_numbers:
            raise ValueError(f"AI rewrite for '{block.id}' introduced an unsupported number.")

        note = (item or {}).get("note")
        note = note.strip() if isinstance(note, str) else ""
        if METRIC_INTENT.search(data.instruction) and not allowed_numbers and not note:
            raise ValueError(f"AI rewrite for '{block.id}' did not report that numeric data was unavailable.")
        results.append({
            "id": block.id,
            "text": text,
            "note": note,
        })

    return results
