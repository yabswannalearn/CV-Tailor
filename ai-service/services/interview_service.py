import os
import json
import re
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

BEHAVIORAL_QUESTIONS = [
    "Tell me about yourself.",
    "Why are you interested in this role?",
    "Describe a challenging project and how you handled it.",
    "Tell me about a time you worked in a team.",
    "What is your greatest strength?",
    "What is your greatest weakness?",
    "Where do you see yourself in 5 years?",
    "Tell me about a time you failed and what you learned.",
    "How do you handle pressure and tight deadlines?",
    "Why should we hire you?",
]

TECHNICAL_QUESTIONS = [
    "Walk me through your most technical project.",
    "How do you approach debugging a hard problem?",
    "How do you stay updated with new technologies?",
    "Describe your development workflow.",
    "How do you ensure code quality?",
]

def get_questions() -> list[str]:
    import random
    behavioral = random.sample(BEHAVIORAL_QUESTIONS, 7)
    technical = random.sample(TECHNICAL_QUESTIONS, 3)
    return behavioral + technical

def build_delivery_section(delivery) -> str:
    """Build the delivery metrics section for the prompt."""
    if not delivery:
        return ""

    lines = ["\nCANDIDATE DELIVERY METRICS (from webcam analysis):"]

    if delivery.eye_contact_pct is not None:
        level = "excellent" if delivery.eye_contact_pct >= 70 else "moderate" if delivery.eye_contact_pct >= 40 else "poor"
        lines.append(f"- Eye contact: {delivery.eye_contact_pct:.0f}% of the time ({level})")

    if delivery.avg_smile is not None:
        level = "warm and confident" if delivery.avg_smile >= 0.5 else "neutral" if delivery.avg_smile >= 0.2 else "tense or flat"
        lines.append(f"- Facial expression: {level} (score: {delivery.avg_smile:.2f})")

    if delivery.blink_rate is not None:
        level = "normal" if 10 <= delivery.blink_rate <= 20 else "elevated (possible nervousness)" if delivery.blink_rate > 20 else "low"
        lines.append(f"- Blink rate: {delivery.blink_rate:.0f} blinks/min ({level})")

    if delivery.posture_score is not None:
        level = "upright and confident" if delivery.posture_score >= 0.7 else "acceptable" if delivery.posture_score >= 0.4 else "slouched"
        lines.append(f"- Posture: {level} (score: {delivery.posture_score:.2f})")

    if delivery.answer_duration_seconds is not None:
        m, s = divmod(delivery.answer_duration_seconds, 60)
        level = "well-paced" if 60 <= delivery.answer_duration_seconds <= 180 else "too brief" if delivery.answer_duration_seconds < 60 else "too long"
        lines.append(f"- Answer duration: {m}m {s}s ({level})")

    return "\n".join(lines)

def analyze_answer(question: str, answer: str, job_title: str, jd: str, delivery=None) -> dict:
    delivery_section = build_delivery_section(delivery)
    has_delivery = delivery is not None

    prompt = f"""
You are an expert interview coach evaluating a candidate's answer.

JOB TITLE: {job_title}

JOB DESCRIPTION (excerpt):
{jd[:800] if jd else "Not provided"}

INTERVIEW QUESTION:
{question}

CANDIDATE'S ANSWER:
{answer}
{delivery_section}

Evaluate the answer and return ONLY valid JSON — no markdown, no explanation, no code fences.

Scoring criteria:
- Relevance: Does the answer address the question directly?
- Keywords: Does it use terminology relevant to the job?
- Structure: Is it clear, organized, and concise? (STAR method for behavioral)
- Impact: Does it demonstrate value or results?
{"- Delivery: Use the webcam metrics above to assess physical presence." if has_delivery else ""}

Return this exact JSON structure:
{{
  "content_score": <integer 1-10>,
  "delivery_score": <integer 1-10 or null if no delivery data>,
  "overall_score": <integer 1-10, weighted average>,
  "verdict": "<one sentence overall verdict>",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "tip": "<one actionable tip for next time>",
  "keyword_hits": ["keyword from JD found in answer"],
  "keyword_misses": ["important JD keyword missing from answer"],
  "delivery_feedback": {{"eye_contact": "<feedback or null>", "expression": "<feedback or null>", "posture": "<feedback or null>", "pacing": "<feedback or null>"}}
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )
        raw = response.text
        raw = re.sub(r"```(?:json)?\s*", "", raw)
        raw = re.sub(r"```", "", raw)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise Exception(f"AI returned invalid JSON: {str(e)}")
    except Exception as e:
        raise Exception(f"Analysis failed: {str(e)}")