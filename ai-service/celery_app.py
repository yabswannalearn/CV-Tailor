import os
from celery import Celery
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Initialize Celery application
celery_app = Celery(
    "ai_service",
    broker=redis_url,
    backend=redis_url,
    include=[] # Task modules
)

# Optional configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # This ensures Celery worker doesn't prefetch too many tasks, 
    # which is good for long-running headless browser tasks
    worker_prefetch_multiplier=1,
)
