# Agent Operating Guide

## Repository Overview

This monorepo contains a Python backend and a Next.js frontend.

### Backend (`backend/`)
- **`ai_tutor/`** – core Python package with FastAPI routes, agents, skills and services.
- **`jobs/`** – background worker scripts.
- **`services/`** – shared utilities outside the package.
- **`tests/`** – Pytest suite for backend logic.
- **`pytest.ini`** – adds `backend` to `PYTHONPATH` for tests.

### Frontend (`frontend/`)
- **`src/`** – React/Next.js application code.
- **`public/`** – static assets.
- **`package.json`** – npm scripts and dependencies.

## Development Environment

### Backend
1. Create a Python 3.10+ virtual environment.
2. Install dependencies:
   ```bash
   pip install -r backend/ai_tutor/requirements.txt
   ```
3. Run the FastAPI app or scripts as needed.

### Frontend
Install node modules (npm or pnpm are both supported):
```bash
cd frontend
npm install  # or pnpm install
```
Start the dev server:
```bash
npm run dev  # or pnpm dev
```

## Tests and Linters

- **Python tests** live under `backend/tests`. Execute with `pytest`:
  ```bash
  cd backend
  pytest
  ```
- **TypeScript lint**: run `pnpm lint` (or `npm run lint`) inside `frontend`.

## Pull Requests

- Use clear titles prefixed with affected area, e.g. `[backend] Fix session bug` or `[frontend] Improve UI`.
- Keep commits focused and run tests/lints before submitting.

## Notes for Codex Agents

- Respect the folder ownership shown above when modifying files.
- `backend/pytest.ini` sets the test path and should not be altered.
- New Python code should include type hints and docstrings (see `backend/improvements.md` checklist).
