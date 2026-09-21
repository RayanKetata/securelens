# SecureLens

**SecureLens** is an AI-assisted cybersecurity assessment platform designed to help security teams evaluate systems against recognized security controls, organize supporting evidence, and track assessment results in one place.

The long-term goal is to make security-control assessment faster, more consistent, and easier to manage while keeping the **human security analyst in control of the final decision**.

---

## Current implementation and AI testing

The React UI and FastAPI/PostgreSQL backend are implemented. The current work is the AI-assisted review and testing phase. The design narrative below includes future plans; it is not a list of remaining tasks for this phase.

### Run locally

1. Install frontend dependencies with `npm install`.
2. Create a Python virtual environment in `backend/venv` and install `backend/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env`, then configure your PostgreSQL database and `OPENAI_API_KEY`. Keep credentials server-side. The backend loads this file relative to its own directory, regardless of the working directory.
4. From `backend`, run `venv/Scripts/python.exe -m uvicorn app.main:app --reload` on Windows (or the equivalent virtual-environment Python on your OS).
5. From the project root, run `npm run dev`. The default API URL is `http://127.0.0.1:8000`; override it with `VITE_API_BASE_URL` in `.env.local` if needed.

The database must exist first. The app creates missing tables on startup; it does not migrate existing tables. Authentication and production deployment remain future work.

### AI review workflow

Open a system's control assessment, upload PDF/TXT evidence, and select **Analyze Evidence**. The backend uses `gpt-5.6-luna` through the OpenAI Responses API with a structured Pydantic response. `OPENAI_MODEL` can override the configured model. See the official [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and [structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs).

The panel displays suggested status, qualitative confidence, reasoning, supporting facts, gaps, and files reviewed. **Apply Suggested Status to Draft** changes only the editable draft status. Notes and findings remain analyst-authored; **Save Assessment** persists the decision. Running or dismissing AI analysis never changes the saved assessment. Uploading evidence preserves unsaved notes and status. Suggestions are temporary, clear when evidence changes or the page is left, and are not an audit history.

Only successfully extracted text is sent to OpenAI. Unreadable and image-only documents are listed as excluded; OCR is not implemented. Each upload is limited to 10 MB, and combined extracted text is limited to 60,000 characters per analysis. Larger evidence sets are rejected rather than silently truncated. The request has a 60-second timeout, no automatic retries, and `store=False`. Provider quota, authentication, timeout, refusal, and incomplete-output failures are shown without changing the final assessment.

The current control catalog contains short summaries, not the complete NIST requirements. Suggestions assess the supplied description and evidence; they do not establish full NIST conformity. Confidence is a model estimate, not a calibrated score.

### Repeatable checks

From the project root:

```powershell
npm run lint
npm run build
```

If the Windows npm launcher reports a missing `npm-cli.js` (as it did on the development machine), the installed tools can also be run directly with `node node_modules/eslint/bin/eslint.js .`, `node node_modules/vite/bin/vite.js build`, and `node node_modules/vite/bin/vite.js` for development. Repair the npm installation before installing new dependencies.

From `backend`:

```powershell
venv/Scripts/python.exe -m unittest discover -s tests -v
# Opt-in: five small billable requests with fictional evidence only.
venv/Scripts/python.exe evaluate_ai.py
# Repeat to measure consistency across nondeterministic outputs.
venv/Scripts/python.exe evaluate_ai.py --repeat 3
```

The offline regression suite uses a temporary SQLite database and mocked provider calls; it never touches the configured PostgreSQL database or calls OpenAI. It covers upload/extraction, analyst-save separation, evidence limits, invalid files, and provider failures. The live evaluation fixture defines a narrow four-rule policy-documentation scope and tests complete, partial, irrelevant, prompt-injection, and explicitly unimplemented evidence. It exits 1 on status mismatches, 2 on a provider/configuration error, and 0 when all expected statuses match. Status matches alone do not verify every explanation or establish broad model accuracy.

For isolated browser testing, from `backend` run `venv/Scripts/python.exe -m tests.preview`. In another terminal at the project root:

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:8001'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort
```

This preview uses fictional data and an explicitly labeled deterministic AI stub. It uses a temporary database and no OpenAI calls; the normal application does not enable the stub.

Latest verification (2026-09-21): all 12 offline tests, frontend lint, and production build passed. Browser checks verified suggestion/apply/save separation, evidence-change invalidation, and draft preservation across upload and save/reload. Live evaluation reached OpenAI but was blocked by the configured account's quota/rate-limit response before any assessment completed. Model accuracy has not yet been verified; resolve account quota/billing or a temporary rate limit and rerun `evaluate_ai.py`.

---

## Overview

Organizations often need to assess applications, platforms, infrastructure, and internal systems against cybersecurity requirements.

A security analyst may need to review:

- Policies
- Procedures
- Architecture documents
- Configuration documents
- Screenshots
- Audit evidence
- System documentation
- Other supporting files

The analyst then determines whether a security control is:

- **Met**
- **Partially Met**
- **Not Met**

SecureLens is intended to centralize that workflow.

Instead of tracking assessments across spreadsheets, folders, documents, and emails, SecureLens provides a dashboard where users can:

1. Create a system.
2. Select security controls.
3. Upload evidence.
4. Review the evidence associated with each control.
5. Record an assessment result.
6. Eventually use AI to suggest an assessment based on the uploaded evidence.
7. Review and confirm the final result.
8. Generate reports and track overall security posture.

---

## Example

Imagine an organization wants to assess an internal system called:

> Employee Payroll System

The system may be evaluated against security controls such as:

- AC-2 — Account Management
- AC-3 — Access Enforcement
- AC-6 — Least Privilege
- IA-2 — Identification and Authentication
- AU-2 — Event Logging
- CP-9 — System Backup
- SC-7 — Boundary Protection

An analyst could upload evidence such as:

```text
account-management-policy.pdf
authentication-configuration.pdf
backup-procedure.pdf
network-architecture.pdf
```

SecureLens would associate the evidence with the appropriate controls.

For example:

```text
AC-2 — Account Management

Suggested Status:
PARTIALLY MET

Evidence Found:
✓ Account creation requires manager approval
✓ Terminated employee accounts are disabled
✓ Privileged accounts require additional approval

Missing Evidence:
✗ No evidence of periodic inactive-account review
```

The analyst would then review the suggestion and either accept it or choose a different assessment result.

---

## What Are AC-2, IA-2, CP-9, and Similar Codes?

SecureLens will initially use security controls based on **NIST SP 800-53 Revision 5**.

NIST SP 800-53 is a cybersecurity and privacy control catalog published by the National Institute of Standards and Technology.

Control identifiers are organized into families.

Examples:

| Code | Control |
| --- | --- |
| AC-2 | Account Management |
| AC-3 | Access Enforcement |
| AC-6 | Least Privilege |
| IA-2 | Identification and Authentication |
| AU-2 | Event Logging |
| CP-9 | System Backup |
| SC-7 | Boundary Protection |

The first letters identify the control family.

Examples:

| Family | Meaning |
| --- | --- |
| AC | Access Control |
| AU | Audit and Accountability |
| CA | Assessment, Authorization and Monitoring |
| CM | Configuration Management |
| CP | Contingency Planning |
| IA | Identification and Authentication |
| IR | Incident Response |
| MA | Maintenance |
| MP | Media Protection |
| PE | Physical and Environmental Protection |
| PL | Planning |
| PS | Personnel Security |
| RA | Risk Assessment |
| SA | System and Services Acquisition |
| SC | System and Communications Protection |
| SI | System and Information Integrity |

For example:

```text
AC-2
```

means:

```text
Access Control
    ↓
Control 2
    ↓
Account Management
```

SecureLens does not assume that every organization must use every available NIST control. Organizations can select the controls that are relevant to the system being assessed.

---

## Main Workflow

The planned SecureLens workflow is:

```text
Create System
      ↓
Select Security Controls
      ↓
Upload Security Evidence
      ↓
Associate Evidence With Controls
      ↓
Analyze Evidence
      ↓
Suggested Assessment
      ↓
Met / Partially Met / Not Met
      ↓
Human Analyst Review
      ↓
Final Assessment
      ↓
Dashboard / Report
```

---

## Main Inputs

SecureLens will intentionally begin with a limited set of inputs.

### 1. System Information

Examples:

```text
System Name
System Description
Business Owner
Environment
Assessment Status
```

Example:

```text
System Name: Employee Payroll System
Business Owner: Human Resources
Environment: Production
```

### 2. Security Controls

Users will be able to select controls instead of manually typing every identifier.

Example:

```text
AC-2 — Account Management
IA-2 — Identification and Authentication
CP-9 — System Backup
SC-7 — Boundary Protection
```

### 3. Evidence

Version 1 will focus on a limited number of document formats.

Initial target:

- PDF
- Plain text

Future support may include:

- Microsoft Word documents
- Images
- Screenshots
- CSV/Excel files
- Configuration files
- Source code

---

## Outputs

SecureLens will produce assessment information such as:

```text
Control:
AC-2 — Account Management

Status:
Partially Met

Evidence:
Account Management Policy

Finding:
The evidence demonstrates account approval and termination procedures,
but does not demonstrate periodic inactive-account reviews.

Recommendation:
Provide or implement a documented inactive-account review process.
```

At the system level, SecureLens can summarize results such as:

```text
Overall Compliance: 82%

Total Controls: 42
Met: 31
Partially Met: 7
Not Met: 4
```

---

## Dashboard

The SecureLens dashboard is intended to give users a quick overview of the security posture of their systems.

Planned dashboard information includes:

- Total controls assessed
- Number of controls met
- Number of controls partially met
- Number of controls not met
- Overall compliance percentage
- Risk overview
- Recent assessments
- Assessment progress
- Systems requiring attention

---

## Main Pages

### Dashboard

Provides an overview of security posture and recent assessments.

### Systems

Allows users to create and manage systems being assessed.

Example systems:

```text
Employee Payroll System
Cloud Management Portal
Customer Database
HR Management System
```

### Assessments

Shows the status of controls for a selected system.

Example:

```text
AC-2    Partially Met
AC-3    Met
IA-2    Met
AU-2    Not Met
CP-9    Met
SC-7    Partially Met
```

### Security Controls

Displays the controls being used in the assessment.

### Evidence

Allows evidence files to be uploaded, reviewed, and connected to controls.

### Reports

Will eventually allow assessment reports to be generated and exported.

### Settings

Will contain application and user configuration options.

---

## AI-Assisted Assessment

The AI component will be added after the core assessment workflow works correctly.

The goal is **not** to make SecureLens a simple chatbot.

The AI will perform a specific task:

> Compare security evidence against a defined security control and suggest an assessment result.

Example process:

```text
Uploaded PDF
     ↓
Extract Text
     ↓
Find Relevant Sections
     ↓
Compare Evidence Against Control Requirements
     ↓
Generate Suggested Assessment
     ↓
Explain Evidence Found
     ↓
Identify Missing Evidence
     ↓
Human Analyst Reviews Result
```

Possible AI output:

```text
Suggested Status:
PARTIALLY MET

Confidence:
87%

Reasoning:
The evidence confirms that account creation requires manager approval
and that terminated accounts are disabled.

However, no evidence was found showing periodic review of inactive accounts.
```

The AI suggestion will **not automatically become the final assessment**.

The security analyst will remain responsible for confirming or changing the result.

---

## Future RAG Architecture

A future version may use Retrieval-Augmented Generation (RAG).

Instead of sending an entire large document to an AI model, SecureLens could:

1. Extract document text.
2. Split the text into smaller chunks.
3. Create embeddings.
4. Search for chunks relevant to a specific control.
5. Send only the relevant evidence to the AI model.
6. Generate an assessment based on that evidence.

Example:

```text
70-page Security Policy
        ↓
Document Parsing
        ↓
Text Chunks
        ↓
Embeddings
        ↓
Vector Search
        ↓
Relevant AC-2 Evidence
        ↓
AI Assessment
```

This would make SecureLens more scalable and technically interesting.

---

## Technology Stack

### Current Frontend

- React
- JavaScript
- CSS
- Vite
- React Router
- ESLint

### Planned Backend

- Python
- FastAPI
- REST API

### Planned Database

- PostgreSQL

### Planned AI / Document Processing

Possible tools include:

- Python document-processing libraries
- Embeddings
- Vector search
- Local or API-based language models
- Retrieval-Augmented Generation

### Planned DevOps

Future versions may include:

- Docker
- GitHub Actions
- CI/CD
- Cloud deployment
- Automated testing

---

## Project Architecture

The planned architecture is:

```text
                         SecureLens

                           React
                             │
                             │ REST API
                             ▼
                          FastAPI
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         PostgreSQL      AI Engine      File Storage
              │              │
              │              ▼
              │          Embeddings
              │              │
              │              ▼
              │        Vector Search
              │              │
              └──────────────┴──────► Assessment
```

---

## SecureLens Version 1

The first version should remain intentionally small.

### Version 1 Goals

- Create systems
- View systems
- Select security controls
- View control information
- Upload evidence
- Associate evidence with controls
- Record assessment status
- Display assessment progress
- Display dashboard statistics

### Version 1 Assessment Statuses

```text
Met
Partially Met
Not Met
```

### Version 1 Evidence

Initially:

```text
PDF
TXT
```

AI analysis will be added only after the manual workflow is functioning correctly.

---

## Testing Strategy

SecureLens will be tested using fictional systems and fictional evidence.

This avoids requiring confidential or real company security documentation.

Example fictional organization:

```text
Northstar Technologies
```

Example system:

```text
Northstar Employee Portal
```

### Example Test Evidence

A fictional account-management policy might contain:

```text
All employee accounts must receive manager approval before being created.

When an employee leaves the organization, their account must be disabled
within 24 hours.

Privileged accounts require approval from the IT Security Manager.

Inactive accounts are reviewed every 90 days.
```

If SecureLens evaluates this against AC-2, the expected result may be:

```text
MET
```

Another test document may intentionally remove the inactive-account requirement.

Expected result:

```text
PARTIALLY MET
```

A third document may contain almost no relevant evidence.

Expected result:

```text
NOT MET
```

---

## AI Evaluation Dataset

A future testing dataset can contain known inputs and expected results.

Example:

| Test | Evidence | Expected Result |
| --- | --- | --- |
| AC-2 Test 1 | All required evidence present | Met |
| AC-2 Test 2 | One requirement missing | Partially Met |
| AC-2 Test 3 | Insufficient relevant evidence | Not Met |
| IA-2 Test 1 | MFA explicitly required | Met |
| IA-2 Test 2 | Password-only authentication | Partially Met / Not Met |
| CP-9 Test 1 | Backup and recovery procedures documented | Met |

This allows the AI assessment engine to be evaluated against expected outcomes.

---

## Types of Testing

### Frontend Testing

Examples:

- Navigation works correctly.
- A new system can be created.
- Forms validate required information.
- Uploaded files appear correctly.
- Controls can be selected.
- Assessment status changes are displayed.

### Backend Testing

Examples:

- `POST /systems` successfully creates a system.
- Invalid requests are rejected.
- Assessment results are stored correctly.
- Unsupported files are rejected.
- Database relationships work correctly.

### AI Evaluation Testing

The AI result can be compared with a known expected assessment.

Conceptual example:

```python
expected = "PARTIALLY_MET"

result = assess_control(document, "AC-2")

assert result.status == expected
```

### Integration Testing

The full process will eventually be tested:

```text
Upload Evidence
      ↓
Extract Text
      ↓
Analyze Evidence
      ↓
Generate Assessment
      ↓
Save Assessment
      ↓
Display Result in React
```

---

## Current Frontend Setup

The current project uses React with Vite.

### Requirements

Make sure Node.js and npm are installed.

Check:

```bash
node -v
npm -v
```

### Install Dependencies

From the SecureLens project directory:

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

Vite will provide a local development URL, commonly:

```text
http://localhost:5173/
```

---

## React Router

SecureLens uses React Router for navigation.

Current routes:

```text
/               Dashboard
/systems        Systems
/assessments    Assessments
/controls       Security Controls
/evidence       Evidence
/reports        Reports
/settings       Settings
```

---

## Current Frontend Structure

```text
securelens/
│
├── src/
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Systems.jsx
│   │   ├── Assessments.jsx
│   │   ├── Controls.jsx
│   │   ├── Evidence.jsx
│   │   ├── Reports.jsx
│   │   └── Settings.jsx
│   │
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
│
├── package.json
└── README.md
```

As the project grows, reusable UI elements can be moved into a `components` directory.

Example:

```text
src/
├── components/
│   ├── Sidebar.jsx
│   ├── Navbar.jsx
│   ├── StatCard.jsx
│   ├── ControlCard.jsx
│   └── RiskBadge.jsx
```

---

## Development Roadmap

### Phase 1 — Frontend Foundation

- [x] Create React project
- [x] Configure Vite
- [x] Add CSS styling
- [x] Create dashboard
- [x] Add page routing
- [x] Build Systems page
- [x] Build Assessments page
- [x] Build Security Controls page
- [x] Build Evidence page
- [x] Build Reports page
- [ ] Improve responsive design

### Phase 2 — Backend

- [x] Create FastAPI application
- [x] Design REST API
- [x] Connect PostgreSQL
- [x] Create system endpoints
- [x] Create control endpoints
- [x] Create assessment endpoints
- [x] Create evidence endpoints

### Phase 3 — Authentication

- [ ] User registration
- [ ] Login
- [ ] Authentication tokens
- [ ] Protected routes
- [ ] User roles

### Phase 4 — Evidence Processing

- [x] Upload PDFs
- [x] Store evidence metadata
- [x] Extract text
- [x] Associate evidence with controls
- [ ] Search evidence

### Phase 5 — AI Assessment

- [x] Build AI assessment service
- [x] Compare evidence to controls
- [x] Generate suggested status
- [x] Explain assessment reasoning
- [x] Identify missing evidence
- [x] Add analyst approval workflow

### Phase 6 — RAG

- [ ] Split documents into chunks
- [ ] Generate embeddings
- [ ] Add vector search
- [ ] Retrieve relevant evidence
- [ ] Generate evidence-grounded assessments

### Phase 7 — Reports

- [x] Generate assessment summaries
- [x] Export PDF reports
- [ ] Export CSV data
- [ ] Add risk summaries

### Phase 8 — Deployment

- [ ] Dockerize frontend
- [ ] Dockerize backend
- [ ] Configure CI/CD
- [ ] Deploy application
- [ ] Add production database

---

## Long-Term Features

Possible future features include:

- Multiple cybersecurity frameworks
- NIST SP 800-53 support
- NIST Cybersecurity Framework support
- ISO 27001 support
- CIS Controls support
- Multiple organizations
- Multiple analysts
- Role-based permissions
- Assessment history
- Evidence versioning
- Audit logs
- Comments and collaboration
- AI-assisted recommendations
- Risk scoring
- PDF report generation
- Control dashboards
- Search
- Notifications
- Source-code analysis
- Configuration-file analysis
- Cloud-security evidence analysis

---

## Design Principle

SecureLens follows one important principle:

> **AI assists the analyst. It does not replace the analyst.**

AI-generated assessments are suggestions.

The final security assessment should remain reviewable and confirmable by a human.

---

## Why This Project?

SecureLens is intended to demonstrate practical experience across several software-engineering areas:

- Frontend development
- React
- JavaScript
- CSS
- Routing
- REST APIs
- Python
- FastAPI
- Database design
- PostgreSQL
- File processing
- Cybersecurity
- Security controls
- AI/LLM integration
- Retrieval-Augmented Generation
- Testing
- Docker
- CI/CD
- Cloud deployment

The project begins as a straightforward security-assessment application and can gradually grow into a full AI-assisted cybersecurity platform.

---

## Project Status

**Current Stage:** AI-assisted review implementation and testing

Current focus:

```text
Dashboard
    ↓
Systems
    ↓
Security Controls
    ↓
Assessments
    ↓
Evidence
```

The frontend and backend are implemented. AI review is connected; live model evaluation is pending API quota availability. See the current implementation section above for setup and verification.

---

## Disclaimer

SecureLens is an educational and portfolio project.

AI-generated security assessments should not be treated as authoritative security, compliance, legal, or certification decisions without qualified human review.

---

## Author

Developed as a full-stack cybersecurity and software-engineering portfolio project.
