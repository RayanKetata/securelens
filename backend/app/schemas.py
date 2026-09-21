from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------
# ASSESSMENT STATUS
# ---------------------------------------------------------

AssessmentStatus = Literal[
    "Not Assessed",
    "Met",
    "Partially Met",
    "Not Met",
]


# ---------------------------------------------------------
# EVIDENCE
# ---------------------------------------------------------

class EvidenceResponse(BaseModel):
    id: int

    controlId: int = Field(
        validation_alias="system_control_id"
    )

    name: str = Field(
        validation_alias="original_filename"
    )

    type: str = Field(
        validation_alias="content_type"
    )

    size: int = Field(
        validation_alias="file_size"
    )

    uploadedAt: datetime = Field(
        validation_alias="uploaded_at"
    )

    extractionStatus: str = Field(
        validation_alias="extraction_status"
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class EvidenceTextResponse(BaseModel):
    id: int

    name: str = Field(
        validation_alias="original_filename"
    )

    extractionStatus: str = Field(
        validation_alias="extraction_status"
    )

    extractedText: str | None = Field(
        validation_alias="extracted_text"
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


# ---------------------------------------------------------
# CONTROLS
# ---------------------------------------------------------

class ControlCreate(BaseModel):
    code: str
    name: str
    family: str
    description: str


class ControlUpdate(BaseModel):
    status: AssessmentStatus | None = None
    analystNotes: str | None = None
    findings: str | None = None


class ControlResponse(BaseModel):
    id: int

    systemId: int = Field(
        validation_alias="system_id"
    )

    code: str
    name: str
    family: str
    description: str
    status: str

    analystNotes: str = Field(
        validation_alias="analyst_notes"
    )

    findings: str

    evidence: list[EvidenceResponse] = Field(
        default_factory=list
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


# ---------------------------------------------------------
# SYSTEMS
# ---------------------------------------------------------

class SystemCreate(BaseModel):
    name: str
    owner: str
    environment: str
    description: str | None = None


class SystemResponse(BaseModel):
    id: int
    name: str
    owner: str
    environment: str
    description: str | None
    status: str
    progress: int
    risk: str

    controls: list[ControlResponse] = Field(
        default_factory=list
    )

    model_config = ConfigDict(
        from_attributes=True
    )
# ---------------------------------------------------------
# AI ASSESSMENT
# ---------------------------------------------------------

class AIAssessmentResult(BaseModel):
    suggestedStatus: Literal[
        "Met",
        "Partially Met",
        "Not Met",
    ]

    confidence: Literal[
        "Low",
        "Medium",
        "High",
    ]

    reasoning: str

    evidenceFound: list[str]

    gaps: list[str]


class AIAssessmentResponse(
    AIAssessmentResult
):
    evidenceFiles: list[str]