from fastapi import APIRouter, HTTPException, Request
from models.schemas import InterviewAnalyzeRequest
from services.interview_service import get_questions, analyze_answer

router = APIRouter(prefix="/interview", tags=["interview"])

@router.get("/questions")
async def questions():
    """Returns the question set for a session."""
    return {"questions": get_questions()}

@router.post("/analyze")
async def analyze(data: InterviewAnalyzeRequest, request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        result = analyze_answer(
            question=data.question,
            answer=data.answer,
            job_title=data.job_title,
            jd=data.jd or "",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))