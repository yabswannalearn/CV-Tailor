from fastapi import FastAPI
from models.schemas import GenerateRequest
from services.llm_service import generate_latex_resume

app = FastAPI()

@app.get("/")
def root():
    return {"hello": "world"}


@app.post("/generate-cv")
async def generate_cv(data: GenerateRequest):
    latex_code = generate_latex_resume(data.profile, data.job_description)
    return {"latex": latex_code}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)