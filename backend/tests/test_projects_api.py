"""Tests for /api/v1/projects endpoints."""

import uuid


class TestProjectsAPI:
    def test_create_project(self, client):
        payload = {
            "name": "New Project",
            "description": "Created via API test",
            "document_scope": [],
            "status": "DRAFT",
        }
        response = client.post("/api/v1/projects/", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["status"] == "DRAFT"
        assert "id" in data

    def test_create_project_invalid_data(self, client):
        response = client.post("/api/v1/projects/", json={"description": "missing name"})
        assert response.status_code == 422

    def test_get_projects(self, client, sample_project):
        response = client.get("/api/v1/projects/")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any(p["id"] == str(sample_project.id) for p in data)

    def test_get_projects_with_filtering(self, client, sample_project):
        response = client.get("/api/v1/projects/", params={"status": "DRAFT"})
        assert response.status_code == 200
        data = response.json()
        assert all(p["status"] == "DRAFT" for p in data)

        response = client.get("/api/v1/projects/", params={"status": "COMPLETED"})
        assert response.status_code == 200
        assert all(p["status"] == "COMPLETED" for p in response.json())

    def test_get_project_by_id(self, client, sample_project):
        response = client.get(f"/api/v1/projects/{sample_project.id}")
        assert response.status_code == 200
        assert response.json()["id"] == str(sample_project.id)

    def test_get_project_not_found(self, client):
        response = client.get(f"/api/v1/projects/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_update_project(self, client, sample_project):
        response = client.put(
            f"/api/v1/projects/{sample_project.id}",
            json={"name": "Updated Project Name", "status": "READY"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Project Name"
        assert data["status"] == "READY"

    def test_update_project_not_found(self, client):
        response = client.put(
            f"/api/v1/projects/{uuid.uuid4()}",
            json={"name": "Ghost"},
        )
        assert response.status_code == 404

    def test_delete_project(self, client, db_session):
        from src.models.db_models import Project

        project = Project(name="To Delete", description="temp", document_scope=[])
        db_session.add(project)
        db_session.commit()
        db_session.refresh(project)

        response = client.delete(f"/api/v1/projects/{project.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_delete_project_not_found(self, client):
        response = client.delete(f"/api/v1/projects/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_get_project_details(self, client, sample_project, sample_answer):
        response = client.get(f"/api/v1/projects/{sample_project.id}/details")
        assert response.status_code == 200
        data = response.json()
        assert data["project"]["id"] == str(sample_project.id)
        assert isinstance(data["questions"], list)
        assert isinstance(data["answers"], list)
        assert data["status"] == sample_project.status

    def test_get_project_details_not_found(self, client):
        response = client.get(f"/api/v1/projects/{uuid.uuid4()}/details")
        assert response.status_code == 404

    def test_mark_project_outdated(self, client, sample_project):
        response = client.post(f"/api/v1/projects/{sample_project.id}/mark-outdated")
        assert response.status_code == 200
        assert response.json()["success"] is True

        updated = client.get(f"/api/v1/projects/{sample_project.id}")
        assert updated.json()["status"] == "OUTDATED"

    def test_mark_project_outdated_not_found(self, client):
        response = client.post(f"/api/v1/projects/{uuid.uuid4()}/mark-outdated")
        assert response.status_code == 404

    def test_get_project_status(self, client, sample_project, sample_answer):
        response = client.get(f"/api/v1/projects/{sample_project.id}/status")
        assert response.status_code == 200
        data = response.json()
        assert data["project"]["id"] == str(sample_project.id)
        assert "answer_statistics" in data
        assert "overall_progress" in data

    def test_get_project_status_not_found(self, client):
        response = client.get(f"/api/v1/projects/{uuid.uuid4()}/status")
        assert response.status_code == 404

    def test_set_project_questionnaire(self, client, db_session, sample_project):
        from src.models.db_models import Questionnaire

        questionnaire = Questionnaire(
            name="Alternate Q",
            description="alt",
            file_path="/tmp/alt.pdf",
        )
        db_session.add(questionnaire)
        db_session.commit()

        response = client.post(
            f"/api/v1/projects/{sample_project.id}/questionnaire",
            params={"questionnaire_id": str(questionnaire.id)},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_get_project_questionnaire(self, client, sample_project):
        response = client.get(f"/api/v1/projects/{sample_project.id}/questionnaire")
        assert response.status_code == 200
        data = response.json()
        assert "questionnaire" in data
        assert data["total_questions"] >= 1

    def test_generate_project_answers_sync(
        self, client, sample_project, sample_questionnaire
    ):
        _questionnaire, questions = sample_questionnaire
        response = client.post(
            f"/api/v1/projects/{sample_project.id}/generate-answers",
            params={"async_processing": False},
            json=[str(questions[0].id)],
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert data["project_id"] == str(sample_project.id)

    def test_generate_project_answers_async(self, client, sample_project):
        response = client.post(
            f"/api/v1/projects/{sample_project.id}/generate-answers",
            params={"async_processing": True},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task_id"] == "test-celery-task-id"

    def test_get_project_answer_statistics(self, client, sample_project, sample_answer):
        response = client.get(
            f"/api/v1/projects/{sample_project.id}/answers/statistics"
        )
        assert response.status_code == 200
        stats = response.json()
        assert "total" in stats
        assert stats["total"] >= 1
