# AI Career Coach

AI Career Coach is a full-stack career preparation app built with React, FastAPI, PostgreSQL, and the OpenAI API. It brings CV feedback, mock interviews, job-fit analysis, company research, and learning roadmaps into one saved workspace.

## Project Overview

Preparing for a job application often means switching between tools and repeatedly entering the same information. AI Career Coach uses a shared candidate profile to support a connected preparation workflow.

### Main features

- **CV intake:** Upload a PDF or DOCX CV, inspect the extracted text, and add a target role, company, and job description.
- **CV review:** Generate strengths, gaps, and suggested improvements.
- **Mock interviews:** Practise generated questions and receive answer evaluation and feedback.
- **Job-fit analysis:** Compare the candidate profile against a job description and identify relevant strengths and gaps.
- **Company preparation:** Generate company research and interview preparation material.
- **Learning roadmap:** Turn identified gaps into learning priorities and next steps.
- **Saved workspaces:** Reopen past preparation sessions and identify outputs based on older intake details.

## Architecture

The React frontend communicates with a FastAPI backend. The backend validates requests, coordinates the AI workflows, and stores workspaces and generated results in PostgreSQL.

```mermaid
flowchart TD
    UI[React frontend] --> API[FastAPI backend]
    API --> Extract[PDF and DOCX extraction]
    API --> Services[AI workflow services]
    API --> DB[(PostgreSQL)]
    Services --> LLM[OpenAI API]
    Services --> Search[Company search tools]
    Services --> DB
```

### How the LLM workflow works

1. The user uploads or pastes a CV and confirms the preparation details.
2. The backend saves a workspace with a versioned intake payload.
3. A selected service combines the relevant intake with task-specific prompts.
4. The OpenAI API generates analysis or coaching content; Pydantic schemas define and validate structured payloads.
5. Generated artifacts are stored with the intake version used to create them, allowing stale-result detection after profile changes.
6. Mock interviews additionally maintain question, answer, and interview state across turns.

This application uses pretrained LLMs through an API; it does not train a custom model. The model is configured through `OPENAI_MODEL`.

### Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Backend | Python, FastAPI |
| Validation | Pydantic |
| Database | PostgreSQL, psycopg, JSONB |
| AI | OpenAI API, task-specific prompts |
| Document parsing | pypdf, python-docx |
| Company research | Search helpers and AI synthesis |

## Demo / Deployment

**[Try AI Career Coach](https://ai-career-coach-web.vercel.app/)**

The frontend is hosted on Vercel. The application uses a separate FastAPI backend and PostgreSQL for persistent storage.

### Try the application

1. Create a workspace using a fictional CV and job description.
2. Generate a CV review and inspect the recommendations.
3. Start a mock interview and submit answers.
4. Review job-fit analysis, company preparation, and the learning roadmap.
5. Reopen the workspace to continue preparation.

## How to Run the Project

### Prerequisites

- Git
- Python 3.11+ compatible with the backend dependencies
- Node.js and npm compatible with the project's Vite version
- A PostgreSQL database
- An OpenAI API key

### 1. Clone the repository

Replace `YOUR_REPOSITORY_URL` with the repository URL:

```bash
git clone YOUR_REPOSITORY_URL ai-career-coach
cd ai-career-coach
```

### 2. Configure the backend

Create `backend/.env` and populate the values locally:

```dotenv
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_COMPANY_MODEL=
FRONTEND_URL=
```

- `DATABASE_URL`: PostgreSQL connection string.
- `OPENAI_API_KEY`: Key for AI requests.
- `OPENAI_MODEL`: Model used by the AI services.
- `FRONTEND_URL`: Allowed frontend origin, if read by the backend CORS configuration. For local development, use `http://localhost:5173`.

If company search requires separate credentials, configure those using the variable names expected by `search_tools.py`.

### 3. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -c "from src.database import create_tables; create_tables()"
uvicorn app:app --reload
```

On Windows PowerShell, use `.venv\Scripts\Activate.ps1` to activate the environment.

The database initialization step creates the required tables using the project’s schema.

- API: http://localhost:8000
- Interactive API documentation: http://localhost:8000/docs
- Alternative API documentation: http://localhost:8000/redoc

### 4. Configure and start the frontend

Create `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:8000
```

Open another terminal from the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Ensure the backend permits this frontend origin through its CORS configuration.

### Validation

From `frontend/`:

```bash
npm run build
npm run lint
```

Run available backend tests against a separate test database. Build and lint checks validate the frontend code, while AI output quality requires separate evaluation.

## Project Structure

```text
.
├── backend/
│   ├── app.py                  # FastAPI routes and orchestration
│   ├── schema.sql              # Database schema
│   ├── requirements.txt        # Python dependencies
│   └── src/
│       ├── ai_company.py       # Company research and preparation
│       ├── ai_cv.py            # CV review and job-fit AI logic
│       ├── ai_interview.py     # Interview generation and feedback
│       ├── database.py         # PostgreSQL connection setup
│       ├── document_tools.py   # PDF/DOCX extraction
│       ├── interview_state.py  # Interview state and validation
│       ├── job_fit_service.py  # Job-fit workflow and persistence
│       ├── prompts.py          # Prompt templates
│       ├── repository.py       # Database CRUD operations
│       ├── roadmap_service.py  # Roadmap workflow and persistence
│       ├── schemas.py          # Pydantic request/response models
│       └── search_tools.py     # Company search helpers
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── sample_data/
├── README.md
└── .gitignore
```

### Backend API routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| POST | `/api/cv/extract` | Extract text from an uploaded CV |
| POST | `/api/workspaces` | Create a workspace |
| GET | `/api/workspaces/{workspace_id}` | Load a workspace |
| PUT | `/api/workspaces/{workspace_id}` | Update intake details |
| DELETE | `/api/workspaces/{workspace_id}` | Delete a workspace |
| POST | `/api/interviews` | Start a mock interview |
| GET | `/api/interviews/{interview_id}` | Load interview state |
| POST | `/api/interviews/{interview_id}/answers` | Submit an answer and continue the interview |
| POST / GET | `/api/workspaces/{workspace_id}/review` | Generate / load a CV review |
| POST / GET | `/api/workspaces/{workspace_id}/fit` | Generate / load job-fit analysis |
| POST / GET | `/api/workspaces/{workspace_id}/roadmap` | Generate / load a learning roadmap |
| POST / GET | `/api/workspaces/{workspace_id}/company-prep` | Generate / load company preparation |

See `/docs` on the running backend for request and response schemas.

## Key Findings / Limitations

### Key findings

- A shared intake lets users reuse candidate and role context across preparation tasks.
- Versioned intake helps identify saved results generated before profile changes.
- Structured schemas validate payload format; users still need to check the quality and accuracy of the advice.
- PostgreSQL preserves workspace data, while browser local storage holds recent session identifiers.

### Limitations

- **AI reliability:** Feedback may contain unsupported claims or inconsistent suggestions. Users should review recommendations before applying them.
- **Job-fit scoring:** Scores are coaching estimates, not employer ATS scores or probabilities of being hired.
- **Document extraction:** Complex formatting or scanned PDFs may need manual correction; OCR support is not documented.
- **Company research:** Quality depends on source relevance, freshness, and the search integration.
- **Cost and latency:** AI workflows depend on external API availability, rate limits, and usage costs.
- **Session history:** Recent workspace identifiers are stored in browser local storage; clearing it can remove those shortcuts.

### Future improvements

- Evaluate feedback relevance and factual grounding using representative preparation scenarios.
- Improve document extraction and company-source attribution.
- Measure response time and API cost across workflows.
- Extend security testing and workspace access controls.

### Data and security

- Keep `.env` files, API keys, and database credentials out of Git.
- Never place secrets in frontend `VITE_` variables.
- Use fictional or anonymized CVs for demonstrations.
- CV context is sent to the configured AI provider, and workspace data and generated results are stored in PostgreSQL. Explain this data flow before collecting real CVs.

## Credits / References

Built as a collaborative AI engineering bootcamp project.

- **OpenAI API:** Pretrained LLM access for generation and analysis.
- **FastAPI and Pydantic:** Backend API and schema validation.
- **React, Vite, and TypeScript:** Frontend development.
- **PostgreSQL and psycopg:** Persistent storage and database access.
- **pypdf and python-docx:** CV text extraction.
Company preparation also uses external search results; refer to the sources supplied with the generated report where available.
