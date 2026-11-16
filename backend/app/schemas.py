from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


# ---------------------------------------------------------
# INPUT CONSTRAINTS (mirror the database column sizes)
# ---------------------------------------------------------

def _required_text(max_length: int | None = None):
    return Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
            max_length=max_length,
        ),
    ]


Name200 = _required_text(200)
Code50 = _required_text(50)
RequiredText = _required_text()
Environment = _required_text(50)


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

    extractionMethod: str | None = Field(
        default=None,
        validation_alias="extraction_method",
    )

    extractionNote: str = Field(
        default="",
        validation_alias="extraction_note",
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class EvidenceSearchResult(BaseModel):
    id: int
    name: str
    type: str
    uploadedAt: datetime
    extractionMethod: str | None
    systemId: int
    systemName: str
    controlCode: str
    controlName: str
    # Occurrences of the search terms in the extracted text.
    matches: int
    # Excerpt around the first match; empty when only the filename matched.
    snippet: str


class EvidenceSearchResponse(BaseModel):
    # The terms that were searched for, lowercased, for highlighting.
    terms: list[str]
    results: list[EvidenceSearchResult]
    # True when more files matched than were ranked.
    truncated: bool


class EvidenceTextResponse(BaseModel):
    id: int

    name: str = Field(
        validation_alias="original_filename"
    )

    extractionStatus: str = Field(
        validation_alias="extraction_status"
    )

    extractionMethod: str | None = Field(
        default=None,
        validation_alias="extraction_method",
    )

    extractionNote: str = Field(
        default="",
        validation_alias="extraction_note",
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
    code: Code50
    name: Name200
    family: Name200
    description: RequiredText


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


class AssessmentHistoryResponse(BaseModel):
    id: int

    previousStatus: str = Field(
        validation_alias="previous_status"
    )

    newStatus: str = Field(
        validation_alias="new_status"
    )

    analystNotes: str = Field(
        validation_alias="analyst_notes"
    )

    findings: str

    changedAt: datetime = Field(
        validation_alias="changed_at"
    )

    changedBy: str = Field(
        validation_alias="changed_by"
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


# ---------------------------------------------------------
# SYSTEMS
# ---------------------------------------------------------

class SystemCreate(BaseModel):
    name: Name200
    owner: Name200
    environment: Environment
    description: str | None = None


class SystemUpdate(BaseModel):
    name: Name200 | None = None
    owner: Name200 | None = None
    environment: Environment | None = None
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
# USERS AND AUTHENTICATION
# ---------------------------------------------------------

Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=80,
        pattern=r"^[A-Za-z0-9._-]+$",
    ),
]

# Passwords are not stripped: spaces are allowed and significant.
Password = Annotated[
    str,
    StringConstraints(
        min_length=12,
        max_length=256,
    ),
]

Role = Literal["admin", "analyst", "viewer"]


class LoginRequest(BaseModel):
    username: str = Field(max_length=80)
    password: str = Field(max_length=256)


class UserCreate(BaseModel):
    username: Username
    password: Password
    role: Role = "analyst"


class SetupRequest(BaseModel):
    username: Username
    password: Password


class UserUpdate(BaseModel):
    role: Role | None = None
    password: Password | None = None


class PasswordChange(BaseModel):
    currentPassword: str = Field(max_length=256)
    newPassword: Password


class UserResponse(BaseModel):
    id: int
    username: str
    role: str

    createdAt: datetime = Field(
        validation_alias="created_at"
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class LoginResponse(BaseModel):
    token: str
    expiresAt: datetime
    user: UserResponse


class ActivityEventResponse(BaseModel):
    id: int
    occurredAt: datetime = Field(validation_alias="occurred_at")
    actor: str
    action: str
    summary: str
    client: str

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class AuthStatusResponse(BaseModel):
    setupRequired: bool


class HealthResponse(BaseModel):
    status: str
    service: str
    aiConfigured: bool
    aiModel: str
    ocrAvailable: bool


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