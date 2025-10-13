"""
City Simulator — Python Sidecar
FastAPI application with geospatial processing engine.
Run: python -m app.main --port 8765 --token <token>
"""
import argparse
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.health import router as health_router
from app.api.city import router as city_router
from app.core.config import settings
from app.core.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — runs on startup and shutdown."""
    logger.info(f"Sidecar starting on port {settings.port}")
    logger.info(f"Auth token configured: {'yes' if settings.token else 'no (dev mode)'}")
    yield
    logger.info("Sidecar shutting down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="City Simulator Sidecar",
        description="Geospatial processing engine for the City Simulator desktop app",
        version=settings.app_version,
        lifespan=lifespan,
    )

    # CORS — allow only localhost (Electron renderer)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:*", "http://127.0.0.1:*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health_router)
    app.include_router(city_router)

    return app


def main():
    """Parse CLI args and start the sidecar server."""
    parser = argparse.ArgumentParser(description="City Simulator Python Sidecar")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--token", type=str, default="", help="Auth token for API access")
    parser.add_argument("--data-dir", type=str, default="", help="User data directory path")
    args = parser.parse_args()

    # Update settings from CLI args
    settings.port = args.port
    settings.token = args.token
    if args.data_dir:
        settings.data_dir = args.data_dir

    app = create_app()

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=settings.port,
        log_level="info",
        access_log=False,  # We handle logging ourselves
    )


if __name__ == "__main__":
    main()
