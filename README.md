# AI Career Coach

An Ironhack pair project for CV review, mock interviews, job-fit analysis,
job discovery, company preparation, and personalized learning plans.

## Current status

- Basic React navigation and Intake form.
- Basic FastAPI health endpoint.
- Feature pages are placeholders.
- AI processing, file extraction, and database integration are in development.

## Requirements

- Git
- Node.js 24 and npm
- Python 3.11 or newer

Use the same Python version as your teammate where possible.

## Clone

```bash
git clone https://github.com/YOUR_USERNAME/ai-career-coach.git
cd ai-career-coach
```

Replace the URL with the actual repository URL.

## Backend installation

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

If an environment example exists, create your local configuration:

```bash
cp .env.example .env
```

Do not commit `.env` or real API keys.

Start the backend:

```bash
python -m uvicorn app:app --reload
```

- Health: http://localhost:8000/api/health
- API documentation: http://localhost:8000/docs

Activate `.venv` again when opening a new backend terminal.

## Frontend installation

Open a second terminal from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Frontend: http://localhost:5173/

`npm ci` uses the committed package-lock.json.
When intentionally changing dependencies, use `npm install`
and commit the updated package.json and package-lock.json.

## Frontend checks

From frontend/:

```bash
npm run build
npm run lint
```

## Backend structure

- app.py: FastAPI endpoints.
- src/schemas.py: shared Pydantic models.
- src/ai_cv.py: CV review, fit analysis, and judge.
- src/ai_interview.py: interview, feedback, and roadmap.
- src/document_tools.py: PDF/DOCX extraction.
- src/search_tools.py: job/company/resource search.
- src/prompts.py: task prompts.
- src/database.py: database connection and operations.

## Development workflow

```bash
git switch main
git pull origin main
git switch -c feat/your-feature
```

Implement and check the feature, then:

```bash
git add .
git commit -m "Describe the change"
git push -u origin feat/your-feature
```

Open a pull request for teammate review.

## Data and secrets

- Use fictional CVs and job descriptions during development.
- Never commit real CVs, API keys, database URLs, or .env files.
- Frontend environment variables are public: do not put secrets there.
- Current Intake data is held in React memory and clears on refresh.