from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routers import ai, auth, health, onboarding, vialts


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.vaults_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

_origins = list(settings.cors_origins) + [
    o.strip() for o in settings.extra_cors.split(",") if o.strip()
]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    return resp


app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(onboarding.router, prefix="/api")
app.include_router(vialts.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
