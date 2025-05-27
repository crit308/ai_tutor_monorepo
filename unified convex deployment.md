Objective: Consolidate all Convex-related backend code (schema, functions, actions, including AI agents and eventually skills) into a single, top-level convex/ directory within the monorepo. The frontend will then use this unified Convex deployment. The separate Node.js WebSocket server (wsServer.ts) will also be configured to use this single Convex deployment via a Convex client.
Estimated Time: 3-5 days (depending on complexity and familiarity with the codebase). This needs to be done carefully to avoid breaking existing frontend functionality.
Pre-requisites:
All current code committed to version control.
Understanding of how convex.json and npx convex dev work.
Step 1: Preparation & Planning (0.5 days)
Backup: Ensure you have a reliable backup or commit of your current frontend/convex/ and backend/convex/ directories.
Identify All Convex Code:
List all files currently in frontend/convex/ (schema, functions, actions, http, auth, etc.).
List all files intended to be Convex code in backend/convex/ (currently, this might just be where you're planning to put things like aiAgents.ts, but it also houses your wsServer.ts which is not Convex code itself but will use Convex).
Plan New Directory Structure:
A single convex/ directory at the monorepo root.
Inside this, you'll have subdirectories mirroring what frontend/convex/ and your planned backend/convex/ (for actual Convex functions/actions) would have:
monorepo_root/
├── convex/
│   ├── schema.ts
│   ├── functions.ts  // For general queries/mutations
│   ├── http.ts
│   ├── auth.ts
│   ├── auth.config.ts
│   ├── crons.ts
│   ├── aiAgents.ts     // Will contain planner actions etc.
│   ├── agents/         // Your TS agent logic (Analyzer, Planner, SessionAnalyzer classes)
│   ├── skills/         // Your TS skill modules (will be called by Node.js, but might call Convex queries/mutations)
│   ├── services/       // Utilities like layoutAllocator, if they become Convex functions or are used by them
│   ├── _generated/     // Will be created here
│   └── package.json    // Dependencies for Convex functions (e.g., openai, yjs if actions use them)
│   └── tsconfig.json
│   └── convex.json     // The single source of truth for Convex project config
├── backend/
│   ├── wsServer.ts     // The Node.js WebSocket server, now outside the new `convex/` dir
│   ├── tutorWs.ts      // Core WebSocket logic for tutor, imported by wsServer.ts
│   └── ... (other backend-specific Node.js/Python code that is NOT Convex functions)
├── frontend/
│   └── ... (Next.js app)
└── package.json        // Monorepo root package.json
Use code with caution.
Decision: Where does wsServer.ts and tutorWs.ts live?
Option 1 (Recommended): Keep them in backend/. They are a distinct Node.js service. This service will then use a ConvexHttpClient or the standard ConvexReactClient (configured for server-side use if possible, or make direct HTTP calls) to interact with the unified Convex deployment defined in monorepo_root/convex/.
Option 2: Move them into monorepo_root/convex/services/websocket/ or similar. This co-locates them if you consider the WebSocket server an intrinsic part of your "Convex backend services", even if it's a separate process. This doesn't fundamentally change how it interacts with Convex functions (still via client/HTTP).
For now, let's assume Option 1.
Update Root package.json:
Ensure scripts for running npx convex dev (now from the root or convex/ dir) and your backend Node.js server (wsServer.ts) are present.
Manage dependencies: openai, ws, jose, etc., needed by wsServer.ts might be in the root package.json or a dedicated backend/package.json. The convex/package.json will list dependencies specifically for Convex functions/actions.
Step 2: Code Migration & Restructuring (1.5 - 2.5 days)
Create Root convex/ Directory:
Initialize convex.json here (or copy from frontend/convex.json and adapt). This will define your project.
Create convex/package.json and convex/tsconfig.json (can be based on those from frontend/convex/).
Migrate frontend/convex/ Content:
Move all files from frontend/convex/ (except _generated/ and potentially node_modules/) to monorepo_root/convex/.
Key files: schema.ts, auth.ts, auth.config.ts, functions.ts, http.ts, crons.ts, etc.
Crucially, your aiAgents.ts (which defines planSessionFocus etc.) should now live in monorepo_root/convex/aiAgents.ts.
The actual agent logic (AnalyzerAgent, PlannerAgent classes) can live in monorepo_root/convex/agents/.
Delete frontend/convex/: Once successfully moved and backed up, remove the old directory to avoid confusion. (Keep frontend/convex.json if it points to your deployment, but the source code for Convex moves).
Correction: The frontend/convex.json typically points to the Convex deployment. If you're unifying, you'll have one convex.json at the root. The frontend will then need to know the URL of this unified deployment.
Update Frontend Imports:
Search your frontend/src/ directory for all imports from convex/... or @/convex/....
These will now need to point to the new central _generated/api that will be created in monorepo_root/convex/_generated/api.
Example: import { api } from "@/convex/_generated/api" might become import { api } from "convex/_generated/api" or you'll adjust TypeScript paths.
Update frontend/src/lib/convex.ts to point to the correct deployment URL if it changes.
Update Backend Node Server (wsServer.ts, tutorWs.ts) Imports & Client:
These files are now in backend/.
They will need a ConvexHttpClient (or similar) to call your unified Convex deployment's HTTP endpoints or actions.
// backend/tutorWs.ts
import { ConvexHttpClient } from "convex/browser"; // Or your preferred way to call Convex HTTP/actions from Node
import { api } from "../convex/_generated/api"; // Path to the new central generated API

const convexClient = new ConvexHttpClient(process.env.CONVEX_URL!); // URL of your unified deployment

// When needing to call the planner:
// const focusObjective = await convexClient.action(api.aiAgents.planSessionFocus, { ...args });
Use code with caution.
TypeScript
Ensure OPENAI_API_KEY is available to backend/wsServer.ts for the Executor's LLM calls.
Ensure CONVEX_URL and any necessary keys for the ConvexHttpClient are available.
Step 3: Configure and Run Unified Convex Deployment (0.5 - 1 day)
Run npx convex dev from Monorepo Root (or convex/ dir):
This should now pick up monorepo_root/convex/convex.json and your schema/functions from monorepo_root/convex/.
It will generate a new monorepo_root/convex/_generated/ directory.
Verify API Generation: Check that monorepo_root/convex/_generated/api.d.ts includes your aiAgents module and its actions (like planSessionFocus).
Update Frontend ConvexReactClient:
In frontend/src/lib/convex.ts, ensure ConvexReactClient is initialized with the URL of your unified Convex deployment.
Update frontend/convex.json to also point to this same deployment.
Update TypeScript Path Aliases:
In frontend/tsconfig.json, ensure paths like @/convex/* correctly resolve to ../convex/* (relative to frontend/src).
In backend/tsconfig.json (if you have one for wsServer.ts), ensure paths to ../convex/* are correct.
In convex/tsconfig.json, paths should be relative to convex/.
Test Frontend:
Run npm run dev in frontend/.
Verify the frontend loads, authenticates, and can make basic Convex queries/mutations that don't involve the AI agents yet (e.g., fetching folders). This confirms the frontend is correctly talking to the unified Convex deployment.
Test Backend Node Server (wsServer.ts):
Run your wsServer.ts (e.g., npm run ws:start from root or backend).
Ensure it can connect to the unified Convex deployment using its client.
Crucially, test the invokePlannerViaHttp (or its new direct convexClient.action call) path. It should now successfully call api.aiAgents.planSessionFocus in your unified Convex deployment. Replace the HTTP call with a direct Convex client action call.
Step 4: Final Integration and Validation (0.5 days)
Remove Mock Planner Call: In backend/tutorWs.ts, replace the mock planner call with the actual call to await convexClient.action(api.aiAgents.planSessionFocus, { ... }).
End-to-End Test:
Start the frontend.
Start the backend/wsServer.ts.
Go through the "Upload & Start" flow.
Verify that the WebSocket connection is established, files are processed, analysis is done (as before), AND the Planner agent is now correctly invoked via the unified Convex deployment, and a FocusObjective is determined and sent back/used by the tutorWs.ts.
Code Review & Cleanup: Review all changed paths, imports, and configurations.