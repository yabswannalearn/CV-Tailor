from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import database_routes, generate_routes

app = FastAPI()

# Add this CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(database_routes.router)
app.include_router(generate_routes.router)

@app.get("/")
def root():
    return {"hello": "world"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)