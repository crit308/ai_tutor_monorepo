// Re-export the backend Convex schema so the frontend and backend share
// a single source of truth. This ensures the generated data model includes
// all tables defined for the backend when running `npx convex dev` in the
// `frontend` directory.
export { default } from "../../convex/schema";
