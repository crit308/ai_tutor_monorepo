# FastAPI to Convex Migration Tasks

This document outlines a set of parallelizable tasks for migrating the remaining Python FastAPI endpoints and orchestration logic to Convex/Node.js. Each task group focuses on a distinct area of the codebase to minimize merge conflicts.

## 1. Baseline Convex/Node Setup
- Ensure the `convex/` directory contains the project scaffolding and schema (already present).
- Configure environment variables for Convex deployments and local testing.
- Add a new Node service (or expand the existing one) that will replace the FastAPI server.

## 2. Folder and Session Endpoints
- Recreate the Python `folders` and `sessions` router endpoints as Convex HTTP functions.
  - `createFolder`, `listFolders`, `renameFolder`, `deleteFolder`.
  - `createSession`, `getSessionMessages`, `updateSessionContext`, etc.
- Implement these functions using the Convex schema located in `convex/schema.ts`.
- Remove Supabase-specific queries from these endpoints.

## 3. Board Summary and Whiteboard APIs
- Port `board_summary.py` logic to a Convex function that reads Yjs data from Redis and returns the same JSON structure.
- Implement whiteboard-related queries/mutations in Node (e.g. snapshot retrieval, Yjs snapshot storage).
- Ensure the function signatures align with the existing front‑end API calls.

## 4. Tutor Workflow Endpoints
- Translate the complex workflow routes from `tutor.py` into Convex mutations or Node server routes.
  - Document upload & analysis triggers.
  - Lesson planning and quiz generation.
  - Interaction endpoints used during tutoring sessions.
- For background tasks currently launched from Python, create equivalent Convex jobs or Node workers.

## 5. WebSocket Functionality
- Rewrite `tutor_ws.py` and `whiteboard_ws.py` as Convex WebSocket handlers or a small Node server using `ws`.
- Maintain the same message shapes so the front‑end can continue using existing WebSocket clients.

## 6. Session Manager and Services
- Convert `session_manager.py` and related service utilities to TypeScript modules.
- Replace direct Supabase access with calls to Convex mutations.
- Provide unit tests for the new modules in the `convex/` or `frontend/convex/` directories.

## 7. Cleanup and Removal of Supabase
- Delete `supabase_schema.sql` and Supabase helper functions once Convex storage is verified.
- Remove Supabase dependencies from `requirements.txt` and environment configuration.
- Update documentation and deployment scripts to reference Convex instead of Supabase.

## 8. Testing and CI Updates
- Mirror the existing pytest coverage with equivalent Node/Convex tests.
- Update CI workflows to run `pnpm lint` and Node tests instead of Python tests when backend code is fully migrated.

### Parallelization Notes
- Each numbered section above can be tackled by separate contributors without touching the same files.
- New Convex functions live in individual files under `convex/`, so teams can implement them concurrently.
- Once all functions are ready, a final integration pass will remove the old FastAPI server.
