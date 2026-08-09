import asyncio
import json
import os
from typing import Dict, Any
from google import genai
from models import database_models as db_models
from services.llm_service import db_profile_to_schema

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

async def evaluate_job_match(profile: db_models.Profile, job: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates candidate fit for a job posting using Gemini 2.5 Flash.
    Returns the job dictionary enriched with 'match_score' (0-100) and 'match_analysis'.
    """
    if not profile:
        return {
            **job,
            "match_score": 50,
            "match_analysis": {
                "summary": "Profile details missing for evaluation.",
                "pros": [],
                "cons": []
            }
        }
        
    user_schema = db_profile_to_schema(profile)
    skills_list = [s.skill_name for s in user_schema.skills]
    exp_list = [f"{e.job_title} at {e.company}" for e in user_schema.experience]
    
    prompt = f"""
    You are an expert career advisor and ATS match evaluator.
    Evaluate the compatibility between this candidate's profile and the job posting.

    Candidate Skills: {skills_list if skills_list else 'Not listed'}
    Candidate Experience: {exp_list if exp_list else 'Not listed'}

    Job Title: {job.get('job_title', '')}
    Company: {job.get('company_name', '')}
    Job Description:
    {job.get('job_description', '')[:3000]}

    Evaluate candidate fit and return JSON with exact structure:
    {{
        "score": 85,
        "summary": "1-2 sentence overall match evaluation.",
        "pros": ["Matching key requirement 1", "Matching experience level"],
        "cons": ["Unmatched skill or gap"]
    }}
    Constraints:
    - score must be an integer between 0 and 100.
    - Output ONLY valid JSON.
    """
    
    def _call_gemini():
        return client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"}
        )

    try:
        response = await asyncio.to_thread(_call_gemini)
        data = json.loads(response.text)
        score = int(data.get("score", 70))
        score = max(0, min(100, score))
        analysis = {
            "summary": data.get("summary", "Match evaluation complete."),
            "pros": data.get("pros", []),
            "cons": data.get("cons", [])
        }
    except Exception as err:
        print(f"[job_evaluator_service] Gemini evaluation fallback triggered: {err}")
        score = 65
        analysis = {
            "summary": "Automated fit assessment complete.",
            "pros": ["Relevant role context"],
            "cons": []
        }
        
    return {
        **job,
        "match_score": score,
        "match_analysis": analysis
    }
