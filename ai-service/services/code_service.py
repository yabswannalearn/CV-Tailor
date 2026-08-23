import subprocess
import time
import os
import re
import json
from dotenv import load_dotenv

load_dotenv()

from services.llm_service import complete

TIMEOUT_SECONDS = 10

# ── Executor ─────────────────────────────────────────────────────
def run_python_code(code: str, stdin: str = "") -> dict:
    start = time.time()
    try:
        result = subprocess.run(
            ["python", "-c", code],
            input=stdin, capture_output=True, text=True,
            timeout=TIMEOUT_SECONDS
        )
        elapsed_ms = int((time.time() - start) * 1000)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "execution_time_ms": elapsed_ms,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {TIMEOUT_SECONDS} seconds.",
            "execution_time_ms": TIMEOUT_SECONDS * 1000,
            "timed_out": True,
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": str(e),
            "execution_time_ms": 0,
            "timed_out": False,
        }

# ── Hint ─────────────────────────────────────────────────────────
def get_hint(problem_title: str, problem_description: str, current_code: str, hint_level: int) -> str:
    subtlety = {
        1: "Give a very subtle hint — just point them toward the right data structure or approach without revealing any logic.",
        2: "Give a moderate hint — explain the approach conceptually but don't show code.",
        3: "Give a near-solution hint — explain the algorithm step by step clearly but still don't write the solution.",
    }.get(hint_level, "Give a subtle hint.")

    prompt = f"""
You are a coding mentor helping a developer practice interview problems.

Problem: {problem_title}
Description: {problem_description}

Current code:
{current_code}

{subtlety}

Keep your hint to 2-4 sentences max. Do not write any code.
"""
    return complete(prompt).strip()

# ── Code review ───────────────────────────────────────────────────
def review_code(problem_title: str, problem_description: str, code: str, output: str = "") -> dict:
    prompt = f"""
You are an expert Python code reviewer doing a technical interview assessment.

Problem: {problem_title}
Description: {problem_description}

Candidate's solution:
{code}

{"Output produced: " + output if output else ""}

Review this solution and return ONLY valid JSON — no markdown, no explanation.

{{
  "time_complexity": "O(...) explanation",
  "space_complexity": "O(...) explanation",
  "correctness": "<correct / partially correct / incorrect>",
  "strengths": ["strength 1", "strength 2"],
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "overall_score": <integer 1-10>,
  "verdict": "<one sentence overall assessment>"
}}
"""
    try:
        raw = complete(prompt)
        raw = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
        start = raw.find("{"); end = raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception as e:
        raise Exception(f"Review failed: {str(e)}")

# ── Explain error ─────────────────────────────────────────────────
def explain_error(code: str, error: str, problem_title: str = "") -> str:
    prompt = f"""
You are a Python tutor helping a developer understand their error.

{"Problem: " + problem_title if problem_title else ""}

Code:
{code}

Error:
{error}

Explain in plain language:
1. What caused this error
2. Exactly where in the code it happens
3. How to fix it

Keep it concise — 3-5 sentences. No code unless absolutely necessary.
"""
    return complete(prompt).strip()

# ── Generate problems from JD ─────────────────────────────────────
def generate_problems_from_jd(job_title: str, jd: str, difficulty: str, count: int) -> list:
    prompt = f"""
You are a technical interviewer creating coding problems for a candidate applying to:

Job Title: {job_title}
Job Description (excerpt): {jd[:600]}

Generate {count} coding problems at {difficulty} difficulty that are RELEVANT to this role.
Focus on skills the JD emphasizes.

Return ONLY valid JSON — no markdown, no explanation:
[
  {{
    "title": "Problem title",
    "difficulty": "{difficulty}",
    "tags": ["relevant", "tags"],
    "description": "Clear problem description",
    "examples": [
      {{"input": "example input", "output": "expected output"}}
    ],
    "constraints": ["constraint 1", "constraint 2"],
    "starter_code": "def solution():\\n    pass\\n\\n# Test\\nprint(solution())"
  }}
]
"""
    try:
        raw = complete(prompt)
        raw = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
        start = raw.find("["); end = raw.rfind("]") + 1
        problems = json.loads(raw[start:end])        # Assign temporary IDs starting from 1000 to avoid collision with hardcoded
        for i, p in enumerate(problems):
            p["id"] = 1000 + i
        return problems
    except Exception as e:
        raise Exception(f"Problem generation failed: {str(e)}")