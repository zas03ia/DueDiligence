"""Tests for root and health endpoints."""


class TestAppEndpoints:
    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "service" in data

    def test_root(self, client):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "Due Diligence" in data["message"]
        assert data["docs"] == "/docs"
        assert data["health"] == "/health"
