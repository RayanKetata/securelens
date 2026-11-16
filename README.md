# SecureLens

**SecureLens** is an AI-assisted cybersecurity assessment platform designed to help security teams evaluate systems against recognized security controls, organize supporting evidence, and track assessment results in one place.

The long-term goal is to make security-control assessment faster, more consistent, and easier to manage while keeping the **human security analyst in control of the final decision**.

---

## Status at a glance (2026-11-16)

### Completed

- **Core app:** React frontend and FastAPI backend with PostgreSQL, covering systems, security controls, assessments, evidence, reports, dashboard, and settings. Input is validated, systems can be edited and deleted, and the layout works at phone width.
- **Accounts and security:**
  - sign-in with admin, analyst, and viewer roles, and first-run admin setup
  - user management by admins
  - self-service password change
  - a failed sign-in limit
  - an admin activity log of who changed what
- **Assessments:** saved history of every status, notes, or findings change, with who made it.
- **Evidence:**
  - PDF, TXT, PNG, and JPEG uploads, with images checked by content
  - text extraction, with OCR (Tesseract) for scanned PDFs and screenshots or photos
  - re-running extraction on files already uploaded
  - **Search Inside Evidence** with highlighted excerpts
- **AI review:** OpenAI suggests a status, reasoning, supporting facts, and gaps for a control. The analyst always makes and saves the decision. The AI is told when text came from OCR.
- **Reports:** report pages with a rule-based risk summary, plus PDF and CSV export.
- **Running and shipping:**
  - Alembic database migrations, applied automatically on startup
  - Docker Compose that runs PostgreSQL, the API, and nginx with one command
  - GitHub Actions CI covering backend tests, frontend lint, tests, and build, and the Docker stack on PostgreSQL

**Tests:** 55 backend tests (2 of them need Tesseract and run in CI and Docker) and 12 frontend unit tests.

### Still missing

- **AI:**
  - RAG: chunking, embeddings, and retrieval of only the relevant evidence. Until then, AI analysis refuses evidence over 60,000 characters.
  - A measured AI accuracy run, blocked by the OpenAI account's quota.
  - A measure of OCR accuracy.
- **Sign-in:** multi-factor authentication, single sign-on, and self-service "forgot password".
- **Deployment:**
  - HTTPS
  - a hosting target and deployment pipeline (CD)
  - automated backups
  - a production database setup
  - CI has not yet run on GitHub
- **Testing:** component and page tests for the frontend. Only the logic in `src/utils` is unit-tested.
- **Smaller gaps:**
  - search does not find word variants or synonyms and has no full-text index
  - background processing for long OCR jobs
  - activity log retention and export
  - the full NIST SP 800-53 control catalog (only 10 summarized controls)

Details for each are in [Known gaps](#known-gaps-not-yet-implemented). The sections below cover setup, how each feature works, and what was verified. The design narrative further down describes the original plan and long-term ideas, not remaining tasks.

## Current implementation

### Run with Docker

The quickest way to run everything (PostgreSQL, the API, and the web app) needs only [Docker](https://docs.docker.com/get-docker/):

1. In the project root, create a file named `.env` containing a database password of your choice:
   ```
   POSTGRES_PASSWORD=choose-a-strong-password
   ```
   Optionally add `OPENAI_API_KEY=...` to turn on AI review, `OPENAI_MODEL=...`, or `WEB_PORT=...` to use a port other than 8080. This file is ignored by git.
2. Run `docker compose up --build -d`.
3. Open http://localhost:8080 and create the first admin account.

How it fits together (`docker-compose.yml`):

- **`web`** (root `Dockerfile`, `docker/nginx.conf`): builds the React app and serves it with nginx. Requests to `/api/...` are forwarded to the API, so the browser talks to a single address and no CORS setup is needed. nginx overwrites `X-Forwarded-For` with the real client address, so the sign-in limit and activity log record real addresses and a client cannot forge one.
- **`backend`** (`backend/Dockerfile`): the FastAPI app, running as an unprivileged user. It applies database migrations on startup. Its port is not published; only `web` can reach it.
- **`db`**: PostgreSQL 17.
- **Data** lives in two named volumes: `db-data` (the database) and `uploads` (evidence files). They survive `docker compose down` and rebuilds. `docker compose down -v` **deletes them**.

Useful commands: `docker compose logs -f backend`, `docker compose ps`, and `docker compose exec db pg_dump -U securelens securelens > backup.sql` for a backup.

This setup serves plain HTTP on your own machine. To share it with other people, put it behind HTTPS (for example a reverse proxy with a certificate) first, since the sign-in token is sent with every request.

### Run locally

To develop without Docker:

1. Install frontend dependencies with `npm install`.
2. Create a Python virtual environment in `backend/venv` and install `backend/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env`, then configure your PostgreSQL database and `OPENAI_API_KEY`. Keep credentials server-side. The backend loads this file relative to its own directory, regardless of the working directory.
4. From `backend`, run `venv/Scripts/python.exe -m uvicorn app.main:app --reload` on Windows (or the equivalent virtual-environment Python on your OS).
5. From the project root, run `npm run dev`. The default API URL is `http://127.0.0.1:8000`; override it with `VITE_API_BASE_URL` in `.env.local` if needed. If the frontend runs on a different origin, add it to `CORS_ORIGINS` (comma-separated) in `backend/.env`.

The **Settings** page shows whether the API is reachable and whether AI review is configured (`GET /health` reports only a yes/no for the key, never the key itself). System details can be edited or the system deleted from its detail page (`PUT /systems/{id}`). API input is validated: blank or oversized names, owners, environments, and control fields are rejected with `422`.

The database must exist first. The backend creates and updates its tables itself with migrations; see [Database migrations](#database-migrations).

### Database migrations

The schema is managed with [Alembic](https://alembic.sqlalchemy.org/) (`backend/alembic.ini`, `backend/migrations/`).

- **Automatic on startup:** when the API starts it applies any pending migrations in one transaction. Set `AUTO_MIGRATE=false` in `backend/.env` to turn this off and run them yourself, for example when several server processes start at once.
- **Existing databases are kept:** a database created before migrations existed (it has the original tables but no `alembic_version` table) is marked as being at the baseline revision `0001_baseline`, then upgraded. Its data is untouched.
- **Earlier builds of this work:** revision `0002` creates only the tables that are missing. If an early build left `assessment_history` without the `changed_by` columns, it adds them and keeps the rows (older entries show no username). You no longer need to drop that table.

Commands, from `backend`:

```powershell
venv/Scripts/python.exe -m alembic upgrade head      # apply pending migrations
venv/Scripts/python.exe -m alembic current           # show the database's revision
venv/Scripts/python.exe -m alembic check             # fails if models and migrations differ
venv/Scripts/python.exe -m alembic revision --autogenerate -m "describe the change"
```

**When you change a model:**
1. Generate a revision with the last command above.
2. Read the generated file in `backend/migrations/versions/` and fix anything autogenerate missed. Renames, for example, show up as a drop plus an add, which loses data.
3. Commit it with the model change.

The offline test `test_fresh_database_matches_models` fails in CI if a model changes without a matching migration.

**Before upgrading a database whose data matters**, back it up (for example with `pg_dump`). Downgrades exist (`alembic downgrade -1`) but drop the tables a revision added, along with their data.

### Sign-in and roles

Every API route except `/`, `/health`, `/auth/status`, `/auth/setup`, and `/auth/login` requires a signed-in user.

1. **First run:** with no accounts in the database, the app shows **Create the first admin account**. `POST /auth/setup` works only while the users table is empty; afterwards it returns `409`. Complete setup right after starting a fresh deployment, because until then anyone who can reach the app could claim the admin account.
2. **Adding people:** admins add, re-role, reset, and delete accounts under **Settings → Users**.
3. **Your own password:** every user can change their own password under **Settings → Your Account → Change Password**. It requires the current password, keeps the current browser signed in, and signs out every other session.

| Role | Can do |
| --- | --- |
| `admin` | Everything, plus user management |
| `analyst` | Create/edit systems and controls, save assessments, upload/delete evidence, run AI analysis |
| `viewer` | Read everything, open evidence, export reports; no changes (the UI disables editing controls and the API returns `403`) |

How it works:

- **Passwords** are hashed with scrypt and a per-user random salt (Python standard library; no new dependencies). Minimum length is 12 characters. Failed sign-ins return the same message whether or not the username exists.
- **Failed sign-in limit:** after 5 failed attempts for the same username from the same address within 15 minutes, that username is blocked from that address until the window passes (`429` with a `Retry-After` header; even the right password is refused). One address may fail 30 times in 15 minutes across all usernames. Blocking by address and username together means a stranger cannot lock a real user out from elsewhere. Wrong current passwords on **Change Password** count toward the same limit. The counters are kept in server memory: they reset when the backend restarts and are not shared across multiple workers. Behind a reverse proxy, start uvicorn with `--proxy-headers` (and `--forwarded-allow-ips` set to the proxy) so the real client address is used; otherwise every visitor shares the proxy's address.
- **Sessions** use a random bearer token. Only its SHA-256 hash is stored in the `user_sessions` table. Sessions expire after 12 hours. Signing out revokes the session on the server, and resetting a user's password signs them out everywhere.
- **The browser** keeps the token in `sessionStorage`, so it is cleared when the tab closes. If the server rejects a session (expired or revoked), the app returns to the sign-in page.
- **Evidence files** are fetched with the token and shown from a temporary blob URL, because a plain link cannot send the token.
- **At least one admin** must always exist: the last admin cannot be demoted or deleted, and nobody can delete their own account.
- **Assessment history** records the username of whoever saved each change.
- **Activity log** (admins only, **Settings → Activity Log**, `GET /activity`): records who did what and when. It covers sign-ins, failed sign-ins, first-run setup, password changes, user account changes, system create/edit/delete, control add/remove and saved assessments, evidence upload/delete, and AI suggestions and failures. Each entry is saved in the same database transaction as the change itself, so a refused or failed action leaves no "done" entry. Sign-in entries also record the client address. Passwords are never logged. The app offers no way to edit or delete entries, and the list can be filtered by category and paged with **Load Older Entries**. Not logged: viewing or downloading evidence, sign-outs, and attempts refused by the failed sign-in limit. Entries are kept indefinitely; there is no retention or export yet.

### AI review workflow

Open a system's control assessment, upload PDF, TXT, PNG, or JPEG evidence, and select **Analyze Evidence**. The backend uses `gpt-5.6-luna` through the OpenAI Responses API with a structured Pydantic response. `OPENAI_MODEL` can override the configured model. See the official [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and [structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs).

The panel displays suggested status, qualitative confidence, reasoning, supporting facts, gaps, and files reviewed. **Apply Suggested Status to Draft** changes only the editable draft status. Notes and findings remain analyst-authored; **Save Assessment** persists the decision. Running or dismissing AI analysis never changes the saved assessment. Uploading evidence preserves unsaved notes and status. Suggestions are temporary, clear when evidence changes or the page is left, and are not an audit history.

Only successfully extracted text is sent to OpenAI, and files without text are listed as excluded. Scanned PDFs are read with OCR when it is available; see [OCR for scanned PDFs](#ocr-for-scanned-pdfs). Each upload is limited to 10 MB, and combined extracted text is limited to 60,000 characters per analysis. Larger evidence sets are rejected rather than silently truncated. The request has a 60-second timeout, no automatic retries, and `store=False`. Provider quota, authentication, timeout, refusal, and incomplete-output failures are shown without changing the final assessment.

### OCR for scanned PDFs

Scanned or photographed documents have no text layer, so ordinary extraction finds nothing in them. SecureLens checks each PDF page. A page with fewer than 20 readable characters is rendered to an image at 300 DPI (pypdfium2) and read with [Tesseract](https://github.com/tesseract-ocr/tesseract). Pages that already have text are left alone, so a mixed document only sends its scanned pages to OCR.

- **Setup:** the Docker image includes Tesseract with English. To develop without Docker, install Tesseract (on Windows, for example the UB Mannheim installer) and either add it to PATH or set `TESSERACT_CMD` in `backend/.env` to its full path. `OCR_LANGUAGES` takes Tesseract language codes such as `eng+fra`, and the language packs must be installed. `OCR_ENABLED=false` turns OCR off. **Settings** shows whether OCR is available.
- **Without Tesseract:** OCR is skipped and scanned PDFs are stored with no text, as before. The file then carries a note saying why.
- **In the app:** text read with OCR is marked with an **OCR** badge. The extracted-text view warns that it may contain recognition errors. The AI is told which files came from OCR.
- **Try Text Extraction Again** (`POST /evidence/{id}/extract`, analysts and admins) re-reads a stored file. For example, use it on scanned PDFs uploaded before OCR was installed. It is recorded in the activity log.
- **Limits:** one file gets at most 30 OCR pages and 90 seconds of OCR, with 30 seconds per page. Pages beyond the limits, and pages Tesseract cannot read, are listed in the file's note. Uploads wait for OCR to finish, which typically takes about a second per page.
- **Images:** PNG and JPEG evidence (screenshots, photos of documents) is read with OCR. Small screenshots are enlarged 2× first, which helps with small interface text, and a phone photo's stored rotation is applied. Uploads are checked by content, not just by extension. A renamed or fake image, an image whose format does not match its extension, a corrupt image, or one over 50 megapixels is refused with `400` and not stored. Images are served with the type found in the file, not the one the browser sent. GIF, WebP, HEIC, and SVG are not accepted.
- **Not covered:** handwriting is not reliably recognized.

The current control catalog contains short summaries, not the complete NIST requirements. Suggestions assess the supplied description and evidence; they do not establish full NIST conformity. Confidence is a model estimate, not a calibrated score.

### Repeatable checks

From the project root:

```powershell
npm run lint
npm test
npm run build
```

`npm test` runs the frontend unit tests with Node's built-in test runner (`node --test src/utils/`), so it needs no extra packages and can also be run directly when npm is broken.

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

This preview uses fictional data and an explicitly labeled deterministic AI stub. It uses a temporary database and no OpenAI calls; the normal application does not enable the stub. It seeds two fictional accounts that exist only in that temporary database: `preview-admin` (admin) and `preview-viewer` (viewer), both with the password listed in `backend/tests/preview.py`.

Latest verification (2026-09-21): all 12 offline tests, frontend lint, and production build passed. Browser checks verified suggestion/apply/save separation, evidence-change invalidation, and draft preservation across upload and save/reload. Live evaluation reached OpenAI but was blocked by the configured account's quota/rate-limit response before any assessment completed. Model accuracy has not yet been verified; resolve account quota/billing or a temporary rate limit and rerun `evaluate_ai.py`.

Verification (2026-11-15): after the changes listed below, all 16 offline tests, frontend lint, and the production build passed. Browser checks against the isolated preview server (fictional data, no OpenAI calls) confirmed: editing system details, Continue Assessment opening the next control, saving a decision and seeing it in Assessment History, the Settings connection status and theme switch, the 404 page, Evidence Library "View" opening the server download, CSV export buttons producing a file, and every main page fitting a 390px-wide (phone) viewport with navigation visible. PDF/CSV file contents and destructive delete dialogs were not exercised in the browser.

Verification after adding sign-in (2026-11-15): all 23 offline tests, frontend lint, and the production build passed. Browser checks against the preview server confirmed:

- signed-out visits show the sign-in page, and the requested page opens after sign-in
- a wrong password shows the generic error
- a viewer sees every editing control disabled, with a view-only notice, while evidence **View** still works through the authenticated blob viewer
- sign-out returns to the sign-in page
- an admin save appears in history with the admin's username
- **Settings → Users** creates an account, changes its role, and hides **Delete** on your own account

The first-run setup screen and password reset were covered by backend tests only, not clicked through in the browser.

Sign-in hardening (2026-11-15): the failed sign-in limit and **Change Password** were added. All 27 offline tests, frontend lint, and the production build passed. Browser checks against the preview server confirmed that the sixth wrong password shows "Too many failed sign-in attempts" and that the right password is then refused too. On **Change Password** they confirmed the mismatch and wrong-current-password errors, and that a successful change keeps the current session signed in.

Activity log (2026-11-15): all 30 offline tests, frontend lint, and the production build passed. Browser checks against the preview server confirmed that a failed sign-in (highlighted), a successful sign-in with the client address, and a system created through the UI appear in **Settings → Activity Log**; that the category filter works; and that a viewer sees neither the Activity Log nor the Users card.

Database migrations (2026-11-15): all 35 backend tests passed, including 5 migration tests:
- a fresh database matches the models exactly
- upgrading twice is safe
- a database from before migrations keeps its data
- the early `assessment_history` table is repaired with its rows kept
- downgrade to base and upgrade again works

`alembic upgrade head`, `current`, `check`, and `history` were run against a temporary SQLite database, and the preview server started and accepted sign-ins with migrations in place of `create_all`. At that point the migrations had only been run on SQLite; see the Docker check below for PostgreSQL. Back up your database before the first start with this version.

Docker (2026-11-16): `docker compose up --build` built both images and started all three containers healthy. On PostgreSQL 17:
- The migrations created all tables, and `alembic check` reported no differences from the models.
- Through nginx, first-admin setup, sign-in, creating a system, adding a control, and uploading evidence all worked. A 12 MB upload was refused with `413`.
- A forged `X-Forwarded-For` header was replaced with the real address in the activity log.
- Data and evidence files survived `docker compose down` and `up`.
- The API ran as the unprivileged `securelens` user.
- In the browser, the app signed in, loaded `/settings` directly, and showed the API as connected at `/api`.

The new CI job's steps also passed when run locally.

OCR (2026-11-16): all 44 backend tests passed inside the backend Docker image with Tesseract 5.5.0, including the real-OCR test. On a machine without Tesseract that test is skipped and the other 43 pass. The tests cover:
- scanned, text-only, and mixed PDFs (only scanned pages go to OCR)
- uploads without OCR and re-extraction afterwards, including permissions and the activity log entry
- Tesseract failures and timeouts, and the page limit
- the OCR notice in the AI prompt
- rejecting language settings that could pass options to Tesseract

On the Docker stack (PostgreSQL 17):
- Migration `0003` upgraded, downgraded, and upgraded again, and `alembic check` reported no differences.
- A generated, slightly skewed scanned PDF uploaded through nginx in 0.6 seconds. Its four lines were read exactly.
- In the browser, the evidence showed the OCR badge, the extracted-text view showed the warning, and the AI panel noted the OCR text.
- **Try Text Extraction Again** appeared only on a file that failed and reported the result.
- Settings showed OCR as available.

Lint, the 7 frontend tests, and the build passed.

Image evidence (2026-11-16): all 48 backend tests passed inside the backend Docker image with real Tesseract, none skipped. New tests cover:
- PNG and JPEG uploads, including a misleading browser-sent type
- the 2× enlargement
- the served content type
- fake, renamed, mismatched, truncated, and oversized images being refused with nothing left in storage
- GIFs being refused
- images uploaded without OCR
- real OCR of a screenshot

On the Docker stack (PostgreSQL 17):
- A generated admin-console screenshot with 14px text and a white-on-dark title bar was read exactly.
- A JPEG stored sideways with a phone's rotation tag was read exactly.
- An HTML file named `.png` was refused.
- The image download came back as `image/png` with `nosniff`, and the activity log recorded both uploads.

Lint, frontend tests, and the build passed. The browser check was skipped because the Chrome extension was not connected.

Evidence search (2026-11-16): all 55 backend tests passed (2 real-OCR tests skipped locally, as before) and all 12 frontend tests passed, along with lint and the build. The new tests cover:
- backend: matching across files, all terms being required, phrases, filename-only matches, `%`, `_`, and `\` matched literally, the system filter, ranking, the limit and 200-match cap, validation, viewer access with anonymous users refused, OCR text, and the excerpts
- frontend: highlighting

On the Docker stack (PostgreSQL 17):
- The same searches behaved as on SQLite, including the wildcard and backslash cases.
- A screenshot uploaded with OCR was found by its text and ranked correctly.
- In the browser, the Evidence page's **Search Inside Evidence** panel found both files for "MFA administrators", highlighted the matches in excerpts and filenames, and showed the OCR badge.

Risk summaries (2026-11-15): all 30 backend tests, 7 new frontend unit tests (`npm test`), lint, and the production build passed. Against the preview server, with one control each Met, Partially Met, Not Met, and Not Assessed:
- The report page showed the High headline, coverage, weakest family, the evidence and findings gaps, priority table, family table, and next steps.
- The Reports cards showed the headline.
- The generated PDF (captured in the page, not saved) contained the Risk Summary, Priority Gap table, Recommended Next Steps, the control details, and "Page N of 2" footers.

### Recent changes (2026-11-15 to 2026-11-16)

A full code review found and fixed the following, and the features after it were then added:

**Bug fixes**

- **Evidence Library "View"** now opens the file from the server. It previously looked for an in-browser file object left over from before the backend existed, so it always reported the file as unavailable. Deleting evidence there now reports success or failure.
- **"Start Assessment"** on the system details page did nothing. It now opens the first control that has not been assessed (or the add-controls dialog if the system has none), and its label changes to Continue or Review Assessment as work progresses.
- **System and report detail pages** briefly showed "Not Found" while data loaded after a refresh. Both now show a loading state first.
- **Creating a system** closed the form even when the request failed. The form now stays open and shows an error.
- **Adding and removing controls** now wait for the server and report failures instead of failing silently.

**New features**

- **Settings page** (previously a placeholder): light/dark theme, API address and reachability, whether AI review is configured and which model is used, and a data reload button.
- **Edit and delete a system** from its detail page, backed by a new `PUT /systems/{id}` endpoint.
- **API input validation:** blank or oversized names, owners, environments, and control fields are rejected with `422`.
- **App-wide error banner** with a Retry button when the backend cannot be reached.
- **404 page** for unknown URLs.
- **`GET /health`** now reports `aiConfigured` (yes/no only, never the key) and `aiModel`.
- **Assessment history:** every saved change to a control's status, notes, or findings is recorded (new `assessment_history` table, `GET /systems/{id}/controls/{code}/history`) and shown on the control assessment page. Saves that change nothing and AI analysis runs do not create entries. History is deleted with its control or system.
- **CSV export:** Reports offers **Export All (CSV)** and each report offers **Export CSV**, one row per control. Cells starting with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with `'` so analyst text cannot run as a spreadsheet formula.
- **Small screens:** below 700px the sidebar becomes a sticky top bar with horizontally scrolling navigation (previously it was hidden, leaving no navigation on phones); headers, summary grids, and Dashboard rows stack.
- **CI:** `.github/workflows/ci.yml` runs the offline backend tests, frontend lint, and the production build on pushes to `main` and on pull requests. It needs no secrets.
- **Sign-in, user accounts, and roles** (admin, analyst, viewer), with first-run admin setup, an admin **Users** screen, and the username recorded on each history entry. See [Sign-in and roles](#sign-in-and-roles).
- **Failed sign-in limit and self-service password change** (`POST /auth/password`).
- **Activity log** for admins (new `activity_log` table, `GET /activity`). See [Sign-in and roles](#sign-in-and-roles).
- **Risk summaries** on report pages, Reports cards, and PDF exports. PDF page footers now appear on every page with "Page N of M". See [Reports](#reports).
- **Frontend unit tests** with Node's built-in runner (`npm test`), also run in CI.
- **Database migrations** with Alembic (new dependency, pinned in `requirements.txt`), applied automatically on startup. See [Database migrations](#database-migrations).
- **Docker:** `docker compose up --build` runs PostgreSQL, the API, and the web app behind nginx. A new CI job builds the images, starts the stack on PostgreSQL, checks migrations with `alembic check`, and checks that the app and API answer through nginx. See [Run with Docker](#run-with-docker).
- **OCR for scanned PDFs** with Tesseract (in the Docker image and CI) and two new pinned packages, pypdfium2 and Pillow. Migration `0003` records how each file's text was extracted. Uploads now extract text off the server's event loop, so a slow PDF no longer blocks other requests. See [OCR for scanned PDFs](#ocr-for-scanned-pdfs).
- **Image evidence:** PNG and JPEG screenshots and photos can be uploaded. They are validated by content and read with OCR.
- **Search inside evidence** on the Evidence page: finds files by their text (including OCR text) with highlighted excerpts, phrase search, and a system filter. See [Evidence](#evidence).

**Maintenance**

- Allowed browser origins are configurable with `CORS_ORIGINS` in `backend/.env` (defaults unchanged).
- Backend errors are logged with Python `logging` instead of `print`.
- `backend/requirements.txt` was re-encoded from UTF-16 to UTF-8 so all tooling can read it.
- The saved theme no longer crashes the app when browser storage is blocked (for example, private browsing).
- Control codes are URL-encoded in page links.
- Regression tests were added for each change: validation, system editing, the health endpoint, assessment history, sign-in, sessions, roles, user management, the failed sign-in limit, password changes, the activity log, migrations, OCR, image uploads, and evidence search. That brings the suite to 55 backend tests, plus 12 frontend unit tests for risk summaries and search highlighting.

### Known gaps (not yet implemented)

- **Sign-in hardening:** there is no multi-factor authentication, no single sign-on, and no self-service "forgot password" (an admin resets it). The failed sign-in limit lives in server memory, so it resets on restart and does not cover multiple workers or attackers spread across many addresses. Use HTTPS in any shared deployment, since the token is sent on every request.
- **OCR limits:** OCR quality is not measured, there is no image preview in the app (**View** opens the file), and uploads wait while OCR runs (up to 90 seconds for a long scan) instead of processing in the background. Local development needs Tesseract installed separately.
- **Live AI accuracy:** `evaluate_ai.py` has not completed a run because of the OpenAI account's quota/rate limit.
- **Control catalog:** only 10 controls with short summaries, not the full NIST SP 800-53 text.
- **Activity log limits:** evidence views/downloads and sign-outs are not logged. There is no retention policy, export, or tamper-evidence: a database administrator can still change rows directly.
- **Frontend tests:** only the risk summary and search-highlighting logic have unit tests. Components and pages have no automated tests (that needs a test library such as Vitest, which requires a working npm install); UI behavior is checked manually in the browser.
- **Risk summaries:** they are rule-based, not tailored narrative. They do not weigh a control's importance (every Not Met counts the same), use a likelihood/impact score, or compare against earlier assessments.
- **Responsive polish:** pages fit phone width, but wide tables scroll horizontally and layouts have not been individually designed for mobile.
- **Deployment:** Docker images and a compose file exist for running the app on one machine. There is no HTTPS setup, hosting target, image registry, or deployment pipeline, and no automated backups. The CI workflow has not yet run on GitHub.
- **Search limits:** evidence search matches exact text, so it does not find word variants ("review" finds "reviewed", but "reviewed" does not find "review") or synonyms. There is no full-text index, so large collections will be slow.
- **RAG:** evidence chunking, embeddings, and vector search are planned but not started. Until then, the AI receives whole files, and analysis is refused when a control's evidence exceeds 60,000 characters.

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

**Search Inside Evidence** (`GET /evidence/search?q=...&systemId=...&limit=...`, any signed-in user) finds files across every system whose extracted text or filename contains all the words entered.
- Matching ignores case, and a "quoted phrase" is matched as a whole.
- Text read with OCR from scans and screenshots is included.
- Each result shows the system and control, a short excerpt with the matches highlighted, and the number of matches. It links to the file and the assessment.
- Results can be limited to one system and are ranked by the number of matches, with filename matches counting extra.
- `%`, `_`, and `\` are searched for literally.

The search box on the **Uploaded Evidence** table still filters the list by file name, system, and control.

How it works: case-insensitive substring matching that behaves the same on PostgreSQL and SQLite. It reads the evidence table on each search, which is fine for thousands of files, and ranks the first 200 matches. A full-text index would be the next step for larger collections. Searches are not recorded in the activity log, just as viewing evidence is not.

### Reports

Shows per-system assessment reports with a one-line risk headline on each card, and exports them as PDF or CSV.

Each report includes a **Risk Summary**:
- a headline explaining the rating
- key points: assessment coverage, the weakest control family, controls rated Met or Partially Met without evidence, and gaps with no written findings
- a **Priority Gaps** table (Not Met first, then Partially Met) with each finding and evidence count
- a per-family breakdown
- numbered **Recommended Next Steps**

The same summary is included in the PDF export. It is written by deterministic rules from the saved decisions, findings, and evidence (`src/utils/riskSummary.js`), not by AI, so the same data always gives the same summary and every statement can be traced to saved data. The rating uses the same rule as the backend: any Not Met → High, any Partially Met → Medium, otherwise Low once a control is assessed. A Low rating with unassessed controls carries a caveat.

### Settings

Sets the light/dark theme, shows whether the backend API is reachable and AI review is configured, and reloads data.

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

### Frontend

- React 19, JavaScript, and CSS
- Vite and React Router
- jsPDF and jspdf-autotable (PDF reports)
- ESLint and Node's built-in test runner

### Backend

- Python and FastAPI (REST API)
- SQLAlchemy 2.0 and Pydantic v2
- Alembic (database migrations)

### Database

- PostgreSQL (SQLite for the offline tests)

### AI and document processing

- OpenAI Responses API with structured output
- pypdf (PDF text), pypdfium2 and Pillow (rendering and images)
- Tesseract (OCR)
- Planned: embeddings, vector search, and retrieval-augmented generation (RAG)

### DevOps

- Docker and Docker Compose, with nginx serving the app and proxying the API
- GitHub Actions CI: tests, lint, build, and the Docker stack on PostgreSQL
- Planned: a deployment pipeline (CD) and cloud hosting

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

## Project Structure

```text
securelens/
├── src/                          React frontend
│   ├── pages/                    Dashboard, Systems, SystemDetails, ControlAssessment,
│   │                             Assessments, Controls, Evidence, Reports, ReportDetails,
│   │                             Settings, Login
│   ├── components/               AIAssessmentPanel, AssessmentHistory, EvidenceSearch,
│   │                             RiskSummary, UserManagement, ActivityLog, ChangePassword,
│   │                             InfoTooltip
│   ├── context/                  Auth and systems state
│   ├── services/api.js           Calls to the backend
│   ├── utils/                    Risk summary, highlighting, PDF/CSV export (+ *.test.js)
│   ├── data/controlCatalog.js    The built-in control catalog
│   ├── App.jsx, App.css, main.jsx
├── backend/
│   ├── app/
│   │   ├── main.py               API routes
│   │   ├── models.py, schemas.py Database tables and API shapes
│   │   ├── auth.py               Sessions, roles, sign-in limit
│   │   ├── activity.py           Activity log
│   │   ├── ai_assessment.py      OpenAI review
│   │   ├── evidence_text.py      Text extraction, image checks
│   │   ├── ocr.py                Tesseract OCR
│   │   ├── search.py             Evidence search
│   │   ├── migrate.py            Runs migrations on startup
│   │   └── config.py, database.py
│   ├── migrations/               Alembic revisions 0001–0003
│   ├── tests/                    Offline test suite
│   ├── alembic.ini, requirements.txt, Dockerfile
├── docker/nginx.conf             Web server and /api proxy
├── Dockerfile                    Web app image
├── docker-compose.yml            PostgreSQL + API + web app
├── .github/workflows/ci.yml      Continuous integration
└── README.md
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
- [x] Improve responsive design (phone-width layout)

### Phase 2 — Backend

- [x] Create FastAPI application
- [x] Design REST API
- [x] Connect PostgreSQL
- [x] Create system endpoints
- [x] Create control endpoints
- [x] Create assessment endpoints
- [x] Create evidence endpoints
- [x] Validate API input
- [x] Edit system details
- [x] Record assessment history
- [x] Database migrations

### Phase 3 — Authentication

- [x] User accounts (first-run admin setup; admins create users)
- [x] Login
- [x] Authentication tokens
- [x] Protected routes
- [x] User roles (admin, analyst, viewer)
- [x] Failed sign-in limit and password change
- [x] Activity log
- [ ] Multi-factor authentication
- [ ] Single sign-on
- [ ] Self-service password reset

### Phase 4 — Evidence Processing

- [x] Upload PDFs
- [x] Store evidence metadata
- [x] Extract text
- [x] Associate evidence with controls
- [x] Search evidence
- [x] OCR for scanned PDFs
- [x] Image evidence (PNG/JPEG) with OCR

### Phase 5 — AI Assessment

- [x] Build AI assessment service
- [x] Compare evidence to controls
- [x] Generate suggested status
- [x] Explain assessment reasoning
- [x] Identify missing evidence
- [x] Add analyst approval workflow
- [ ] Measure accuracy on the evaluation dataset (blocked by API quota)

### Phase 6 — RAG

- [ ] Split documents into chunks
- [ ] Generate embeddings
- [ ] Add vector search
- [ ] Retrieve relevant evidence
- [ ] Generate evidence-grounded assessments

### Phase 7 — Reports

- [x] Generate assessment summaries
- [x] Export PDF reports
- [x] Export CSV data
- [x] Add risk summaries

### Phase 8 — Deployment

- [x] Dockerize frontend
- [x] Dockerize backend
- [x] Configure CI (tests, lint, build, Docker stack)
- [ ] Configure deployment pipeline (CD)
- [ ] Deploy application with HTTPS
- [ ] Add production database and automated backups

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

**Current stage:** feature-complete for Version 1 and runnable with Docker. Next up: RAG, sign-in hardening, and deployment.

The frontend, backend, accounts, evidence processing (with OCR and search), AI review, reports, migrations, Docker, and CI are implemented. Live AI evaluation is waiting on API quota. See [Status at a glance](#status-at-a-glance-2026-11-16) for what is done and what is missing.

---

## Disclaimer

SecureLens is an educational and portfolio project.

AI-generated security assessments should not be treated as authoritative security, compliance, legal, or certification decisions without qualified human review.

---

## Author

Developed as a full-stack cybersecurity and software-engineering portfolio project.
