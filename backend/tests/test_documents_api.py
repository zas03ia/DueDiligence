"""Tests for /api/v1/documents endpoints."""

import io
import uuid


class TestDocumentsAPI:
    def test_get_supported_document_types(self, client):
        response = client.get("/api/v1/documents/types/supported")
        assert response.status_code == 200
        types = {item["type"] for item in response.json()["supported_types"]}
        assert types == {"PDF", "DOCX", "XLSX", "PPTX"}

    def test_get_chunking_strategies(self, client):
        response = client.get("/api/v1/documents/chunking/strategies")
        assert response.status_code == 200
        names = {s["name"] for s in response.json()["strategies"]}
        assert "PARAGRAPH" in names

    def test_upload_document_pdf(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            response = client.post(
                "/api/v1/documents/upload",
                files={"file": ("report.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "report.pdf"
        assert data["file_type"] == "PDF"

    def test_upload_document_docx(self, client, upload_dir):
        path = upload_dir / "notes.docx"
        path.write_bytes(b"PK\x03\x04 fake docx bytes")
        with path.open("rb") as handle:
            response = client.post(
                "/api/v1/documents/upload",
                files={
                    "file": (
                        "notes.docx",
                        handle,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
                data={"auto_index": "false"},
            )
        assert response.status_code == 200
        assert response.json()["file_type"] == "DOCX"

    def test_upload_document_xlsx(self, client, upload_dir):
        path = upload_dir / "sheet.xlsx"
        path.write_bytes(b"PK\x03\x04 fake xlsx bytes")
        with path.open("rb") as handle:
            response = client.post(
                "/api/v1/documents/upload",
                files={"file": ("sheet.xlsx", handle, "application/vnd.ms-excel")},
                data={"auto_index": "false"},
            )
        assert response.status_code == 200
        assert response.json()["file_type"] == "XLSX"

    def test_upload_document_pptx(self, client, upload_dir):
        path = upload_dir / "deck.pptx"
        path.write_bytes(b"PK\x03\x04 fake pptx bytes")
        with path.open("rb") as handle:
            response = client.post(
                "/api/v1/documents/upload",
                files={"file": ("deck.pptx", handle, "application/vnd.ms-powerpoint")},
                data={"auto_index": "false"},
            )
        assert response.status_code == 200
        assert response.json()["file_type"] == "PPTX"

    def test_upload_document_with_auto_index(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            response = client.post(
                "/api/v1/documents/upload",
                files={"file": ("indexed.pdf", handle, "application/pdf")},
                data={"auto_index": "true", "chunking_strategy": "PARAGRAPH"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["auto_index"] is True
        assert data["indexing_task_id"] == "test-celery-task-id"

    def test_upload_document_unsupported_type(self, client):
        response = client.post(
            "/api/v1/documents/upload",
            files={"file": ("readme.txt", io.BytesIO(b"hello"), "text/plain")},
            data={"auto_index": "false"},
        )
        assert response.status_code == 400

    def test_upload_document_no_file(self, client):
        response = client.post("/api/v1/documents/upload", data={"auto_index": "false"})
        assert response.status_code == 422

    def test_get_documents(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            client.post(
                "/api/v1/documents/upload",
                files={"file": ("list-me.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        response = client.get("/api/v1/documents/")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert len(response.json()) >= 1

    def test_get_documents_with_type_filter(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            client.post(
                "/api/v1/documents/upload",
                files={"file": ("filter.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        response = client.get("/api/v1/documents/", params={"file_type": "PDF"})
        assert response.status_code == 200
        assert all(doc["file_type"] == "PDF" for doc in response.json())

    def test_get_documents_indexed_only(self, client):
        response = client.get("/api/v1/documents/", params={"indexed_only": True})
        assert response.status_code == 200
        assert all(doc["indexed"] is True for doc in response.json())

    def test_get_document_by_id(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("by-id.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.get(f"/api/v1/documents/{document_id}")
        assert response.status_code == 200
        assert response.json()["id"] == document_id

    def test_get_document_not_found(self, client):
        response = client.get(f"/api/v1/documents/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_index_document(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("index-me.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.post(
            f"/api/v1/documents/{document_id}/index",
            params={"chunking_strategy": "PARAGRAPH"},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_index_document_invalid_strategy(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("bad-strategy.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.post(
            f"/api/v1/documents/{document_id}/index",
            params={"chunking_strategy": "INVALID"},
        )
        assert response.status_code == 400

    def test_reindex_document(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("reindex.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.post(f"/api/v1/documents/{document_id}/reindex")
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_delete_document(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("delete-me.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.delete(f"/api/v1/documents/{document_id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_delete_document_not_found(self, client):
        response = client.delete(f"/api/v1/documents/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_get_document_index_info(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("index-info.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.get(f"/api/v1/documents/{document_id}/index-info")
        assert response.status_code == 200
        assert response.json()["document_id"] == document_id

    def test_get_document_content(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("content.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.get(f"/api/v1/documents/{document_id}/content")
        assert response.status_code == 200
        data = response.json()
        assert data["document_id"] == document_id
        assert "chunks" in data

    def test_search_documents(self, client):
        response = client.post(
            "/api/v1/documents/search",
            params={"query": "investment strategy", "top_k": 5},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "investment strategy"
        assert "results" in data

    def test_search_documents_with_ids(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("search-scope.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.post(
            "/api/v1/documents/search",
            params={
                "query": "fund",
                "document_ids": [document_id],
                "top_k": 3,
            },
        )
        assert response.status_code == 200

    def test_download_document(self, client, sample_document_file):
        with sample_document_file.open("rb") as handle:
            created = client.post(
                "/api/v1/documents/upload",
                files={"file": ("download.pdf", handle, "application/pdf")},
                data={"auto_index": "false"},
            )
        document_id = created.json()["id"]
        response = client.get(f"/api/v1/documents/{document_id}/download")
        assert response.status_code == 200
        assert response.content
