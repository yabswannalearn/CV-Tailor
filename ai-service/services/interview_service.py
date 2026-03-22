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
    """Returns 7 behavioral + 3 technical = 10 questions."""
    import random
    behavioral = random.sample(BEHAVIORAL_QUESTIONS, 7)
    technical = random.sample(TECHNICAL_QUESTIONS, 3)
    return behavioral + technical

def analyze_answer(question: str, answer: str, job_title: str, jd: str) -> dict:
    """Send answer to Gemini for analysis. Returns structured feedback."""

    prompt = f"""
You are an expert interview coach evaluating a candidate's answer.

JOB TITLE: {job_title}

JOB DESCRIPTION (excerpt):
{jd[:800] if jd else "Not provided"}

INTERVIEW QUESTION:
{question}

CANDIDATE'S ANSWER:
{answer}

Evaluate the answer and return ONLY a valid JSON object — no markdown, no explanation.

Scoring criteria:
- Relevance: Does the answer address the question directly?
- Keywords: Does it use terminology relevant to the job?
- Structure: Is it clear, organized, and concise?
- Impact: Does it demonstrate value or results?

Return this exact JSON:
{{
  "score": <integer 1-10>,
  "verdict": "<one line overall verdict>",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "tip": "<one actionable tip for next time>",
  "keyword_hits": ["keyword from JD found in answer"],
  "keyword_misses": ["important JD keyword missing from answer"]
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
        )
        raw = response.text
        # Strip markdown fences if present
        raw = re.sub(r"```(?:json)?\s*", "", raw)
        raw = re.sub(r"```", "", raw)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]
        return json.loads(raw)
    except Exception as e:
        raise Exception(f"Analysis failed: {str(e)}")