from fastapi import APIRouter, Header, HTTPException
from typing import Optional
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health_check(authorization: Optional[str] = Header(None)):
    """
    Health check endpoint.
    Verifies the sidecar is running and the auth token is valid.
    Called by Electron main process on startup and periodically.
    """
    _verify_token(authorization)

    return {
        "status": "ok",
        "version": settings.app_version,
        "port": settings.port,
    }


def _verify_token(authorization: Optional[str]):
    """Verify the Bearer token matches the one passed at startup."""
    if not settings.token:
        return  # No token configured (dev mode)

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer" or parts[1] != settings.token:
        raise HTTPException(status_code=403, detail="Invalid token")
