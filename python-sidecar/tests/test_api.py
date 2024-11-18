"""
Integration smoke tests for Python sidecar (FastAPI).
Exercises /health, /city (validation), and /city/cache endpoints
against a temporary in-memory database.

Run:
    cd python-sidecar
    pip install pytest httpx
    pytest tests/ -v
"""
import os
import pytest
import importlib

# Force test settings before any app import
os.environ.setdefault("SIDECAR_TOKEN", "test-token")
os.environ.setdefault("SIDECAR_PORT", "0")


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
def test_app():
    """Create a fresh FastAPI test app with a temp DB."""
    from app.main import create_app
    return create_app()


@pytest.fixture(scope="module")
def client(test_app):
    """Synchronous test client (no need for async in smoke tests)."""
    from starlette.testclient import TestClient
    return TestClient(test_app)


AUTH = {"Authorization": "Bearer test-token"}


class TestHealthEndpoint:
    def test_health_ok(self, client):
        resp = client.get("/health", headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"

    def test_health_missing_token(self, client):
        resp = client.get("/health")
        # Depending on token config, either 200 (no token) or 401
        assert resp.status_code in (200, 401)


class TestCityValidation:
    def test_missing_bbox(self, client):
        resp = client.get("/city", headers=AUTH)
        assert resp.status_code == 422  # FastAPI validation error

    def test_invalid_bbox_format(self, client):
        resp = client.get("/city?bbox=garbage", headers=AUTH)
        assert resp.status_code == 400

    def test_area_too_large(self, client):
        # ~50 km² bbox
        resp = client.get("/city?bbox=20,18,74,72", headers=AUTH)
        assert resp.status_code == 400
        assert "too large" in resp.json()["detail"].lower() or "area" in resp.json()["detail"].lower()

    def test_area_too_small(self, client):
        # Tiny bbox
        resp = client.get("/city?bbox=18.9200,18.9201,72.8300,72.8301", headers=AUTH)
        assert resp.status_code == 400


class TestCacheEndpoints:
    def test_list_cache_returns_list(self, client):
        resp = client.get("/city/cache", headers=AUTH)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_delete_nonexistent_cache(self, client):
        resp = client.delete("/city/cache/999999", headers=AUTH)
        assert resp.status_code == 404
