import requests
from models.schemas import UserProfile

def generate_latex_resume(profile: UserProfile, jd: str) -> str:
    # Minimalist Prompting (KISS)
    prompt = f"""
    You are an expert technical resume writer. 
    Using the following User Profile and Job Description, generate a LaTeX resume.
    Use the 'Jake's Resume' template style.
    
    USER PROFILE:
    {profile.json()}
    
    JOB DESCRIPTION:
    {jd}
    
    INSTRUCTIONS:
    - Tailor the experience bullets to match the JD keywords.
    - Return ONLY the raw LaTeX code. No conversational text.
    - Use standard LaTeX packages (hyperref, geometry, enumitem).
    """
    
    try:
            response = requests.post(
                "http://localhost:11434/api/generate", 
                json={"model": "qwen2.5:7b", "prompt": prompt, "stream": False},
                timeout=120 # Generation takes time
            )
            res_json = response.json()
            
            # Debugging: Print this to your FastAPI terminal
            print(f"DEBUG OLLAMA RESPONSE: {res_json}")
            
            return res_json.get("response", "KEY 'response' NOT FOUND")
    
    except Exception as e:
            return f"SERVICE ERROR: {str(e)}"