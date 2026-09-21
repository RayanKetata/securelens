"""Isolated browser test server: fictional data and a deterministic AI stub.

Run from backend: python -m tests.preview
Never loads the real database or sends OpenAI requests.
"""
import os
import tempfile
from pathlib import Path

import uvicorn


def main():
    with tempfile.TemporaryDirectory(prefix="securelens-preview-") as directory:
        os.environ["DATABASE_URL"] = "sqlite:///" + (Path(directory) / "preview.db").as_posix()
        os.environ["OPENAI_API_KEY"] = "preview-only"
        from app import main as api, models, schemas
        from app.database import SessionLocal, engine

        api.UPLOAD_DIR = Path(directory)
        from fastapi.middleware.cors import CORSMiddleware
        api.app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5174"],
                               allow_methods=["*"], allow_headers=["*"])
        with SessionLocal() as db:
            system = models.System(name="Northstar UI Test (isolated)", owner="Test Analyst", environment="Test")
            control = models.SystemControl(code="AC-2", name="Account Management", family="Access Control",
                                           description="Document approvals and periodic account review.")
            system.controls.append(control)
            control.evidence.append(models.Evidence(original_filename="policy.txt", stored_filename="policy.txt",
                content_type="text/plain", file_size=26, extracted_text="Manager approval required.", extraction_status="completed"))
            (Path(directory) / "policy.txt").write_text("Manager approval required.")
            db.add(system)
            db.commit()

        def fake_analysis(control, evidence):
            return schemas.AIAssessmentResult(suggestedStatus="Partially Met", confidence="Medium",
                reasoning="UI test fixture: approval is documented but periodic account review is missing.",
                evidenceFound=["policy.txt: Manager approval required."], gaps=["No periodic review is documented."]), [item.original_filename for item in evidence]

        api.analyze_control_evidence = fake_analysis
        try:
            uvicorn.run(api.app, host="127.0.0.1", port=8001)
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()
