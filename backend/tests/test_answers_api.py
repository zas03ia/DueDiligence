"""Tests for /api/v1/answers endpoints."""

import uuid


class TestAnswersAPI:
    def test_generate_single_answer(
        self, client, sample_project, sample_questionnaire
    ):
        _questionnaire, questions = sample_questionnaire
        response = client.post(
            "/api/v1/answers/generate-single",
            json={
                "project_id": str(sample_project.id),
                "question_ids": [str(questions[0].id)],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "result" in data

    def test_generate_single_answer_no_question_ids(self, client, sample_project):
        response = client.post(
            "/api/v1/answers/generate-single",
            json={"project_id": str(sample_project.id)},
        )
        assert response.status_code == 400

    def test_generate_single_answer_async(
        self, client, sample_project, sample_questionnaire
    ):
        _questionnaire, questions = sample_questionnaire
        response = client.post(
            "/api/v1/answers/generate-single-async",
            json={
                "project_id": str(sample_project.id),
                "question_ids": [str(questions[0].id)],
            },
        )
        assert response.status_code == 200
        assert response.json()["task_id"] == "test-celery-task-id"

    def test_generate_all_answers(self, client, sample_project):
        response = client.post(
            "/api/v1/answers/generate-all",
            json={"project_id": str(sample_project.id)},
        )
        assert response.status_code == 200
        assert response.json().get("success") is True

    def test_generate_all_answers_async(self, client, sample_project):
        response = client.post(
            "/api/v1/answers/generate-all-async",
            json={"project_id": str(sample_project.id)},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_get_answer_by_id(self, client, sample_answer):
        response = client.get(f"/api/v1/answers/{sample_answer.id}")
        assert response.status_code == 200
        assert response.json()["id"] == str(sample_answer.id)

    def test_update_answer(self, client, sample_answer):
        response = client.put(
            f"/api/v1/answers/{sample_answer.id}",
            json={"manual_answer": "Reviewer override answer"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["manual_answer"] == "Reviewer override answer"

    def test_confirm_answer(self, client, sample_answer):
        response = client.post(f"/api/v1/answers/{sample_answer.id}/confirm")
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_reject_answer(self, client, sample_answer):
        response = client.post(
            f"/api/v1/answers/{sample_answer.id}/reject",
            params={"reason": "Insufficient evidence"},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_regenerate_answer(self, client, sample_answer):
        response = client.post(f"/api/v1/answers/{sample_answer.id}/regenerate")
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_get_project_answers(self, client, sample_project, sample_answer):
        response = client.get(f"/api/v1/answers/project/{sample_project.id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_get_project_answers_with_context(self, client, sample_project, sample_answer):
        response = client.get(
            f"/api/v1/answers/project/{sample_project.id}/with-context"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] == str(sample_project.id)
        assert data["total_answers"] >= 1

    def test_evaluate_answers(
        self, client, sample_project, sample_answer, sample_questionnaire, monkeypatch
    ):
        _questionnaire, questions = sample_questionnaire

        def fake_evaluate(project_id, ground_truth_answers):
            return {
                "overall_score": 0.88,
                "question_scores": {str(questions[0].id): 0.88},
                "similarity_metrics": {"combined": {"mean": 0.88}},
                "detailed_comparison": [
                    {
                        "question_id": str(questions[0].id),
                        "similarity_score": 0.88,
                    }
                ],
            }

        monkeypatch.setattr(
            "src.services.evaluation_service.EvaluationService.evaluate_project_answers",
            fake_evaluate,
        )

        response = client.post(
            "/api/v1/answers/evaluate",
            json={
                "project_id": str(sample_project.id),
                "ground_truth_answers": {str(questions[0].id): "Expected answer"},
            },
        )
        assert response.status_code == 200
        assert response.json()["overall_score"] == 0.88

    def test_compare_ai_vs_manual_answers(self, client, sample_project, sample_answer):
        response = client.get(
            f"/api/v1/answers/project/{sample_project.id}/compare-ai-manual"
        )
        assert response.status_code == 200

    def test_get_answer_statistics(self, client, sample_project, sample_answer):
        response = client.get(
            f"/api/v1/answers/project/{sample_project.id}/statistics"
        )
        assert response.status_code == 200
        stats = response.json()
        assert stats["total"] >= 1

    def test_get_question_answer(
        self, client, sample_project, sample_questionnaire, sample_answer
    ):
        _questionnaire, questions = sample_questionnaire
        response = client.get(
            f"/api/v1/answers/question/{questions[0].id}/project/{sample_project.id}"
        )
        assert response.status_code == 200
        assert "answer" in response.json()

    def test_get_answer_not_found(self, client):
        response = client.get(f"/api/v1/answers/{uuid.uuid4()}")
        assert response.status_code == 404
