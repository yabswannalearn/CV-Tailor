from fastapi import APIRouter, HTTPException, Request
from models.schemas import (
    CodeRunRequest, CodeHintRequest,
    CodeReviewRequest, CodeExplainErrorRequest, CodeGenerateRequest
)
from services.code_service import (
    run_python_code, get_hint, review_code,
    explain_error, generate_problems_from_jd
)
from services.problems.code_problems import get_all_problems, get_problem_by_id

router = APIRouter(prefix="/code", tags=["code"])

def require_auth(request: Request) -> int:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id

@router.post("/run")
async def run_code(data: CodeRunRequest, request: Request):
    require_auth(request)
    result = run_python_code(data.code, data.stdin or "")
    return result

@router.get("/problems")
async def list_problems(request: Request):
    require_auth(request)
    return {"problems": get_all_problems()}

@router.get("/problems/{problem_id}")
async def get_problem(problem_id: int, request: Request):
    require_auth(request)
    problem = get_problem_by_id(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return problem

@router.post("/hint")
async def hint(data: CodeHintRequest, request: Request):
    require_auth(request)
    try:
        result = get_hint(data.problem_title, data.problem_description, data.current_code, data.hint_level)
        return {"hint": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/review")
async def review(data: CodeReviewRequest, request: Request):
    require_auth(request)
    try:
        result = review_code(data.problem_title, data.problem_description, data.code, data.output or "")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/explain-error")
async def explain(data: CodeExplainErrorRequest, request: Request):
    require_auth(request)
    try:
        result = explain_error(data.code, data.error, data.problem_title or "")
        return {"explanation": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate")
async def generate(data: CodeGenerateRequest, request: Request):
    require_auth(request)
    try:
        problems = generate_problems_from_jd(data.job_title, data.jd, data.difficulty, data.count)
        return {"problems": problems}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))