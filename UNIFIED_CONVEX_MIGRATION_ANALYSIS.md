# Unified Convex Deployment - Migration Analysis
## Phase 1.1 & 1.2 Findings and Implementation Plan

**Date**: January 2025  
**Goal**: Document current architecture and create migration plan for Option C (Unified Convex Deployment)

---

## 📊 Current Architecture Analysis

### 1. Frontend Convex Configuration

**Location**: `frontend/convex/`

**Current Setup**:
- **Deployment Method**: Frontend runs the actual Convex deployment (`cd frontend; npx convex dev`)
- **Re-export Pattern**: All backend functions accessed via path mapping through `tsconfig.json`
- **Path Mapping**: `"backend-convex/*": ["../../convex/*"]`

**Re-export Files**:
```typescript
// frontend/convex/functions.ts
export * from "backend-convex/functions";

// frontend/convex/auth.ts  
export * from "backend-convex/auth";

// frontend/convex/http.ts
export { default } from "backend-convex/http";

// frontend/convex/aiAgents.ts
export * from "backend-convex/aiAgents";

// frontend/convex/schema.ts
export { default } from "../../convex/schema";
```

**Generated API**:
- Frontend API includes: `aiAgents`, `auth`, `functions`, `http`
- Backend API includes: `auth`, `functions`, `http` (missing `aiAgents`)

### 2. Backend Convex Structure

**Location**: `convex/`

**Core Files**:
- `schema.ts` - Database schema (33 tables)
- `functions.ts` - Main CRUD operations (1008 lines)
- `auth.ts` - Authentication system (268 lines)
- `http.ts` - HTTP endpoints (374 lines)
- `aiAgents.ts` - AI agent actions (565 lines)
- `agents/` - AI agent implementations

**WebSocket Integration**:
- `tutorWs.ts` - Main WebSocket handler (596 lines)
- `wsServer.ts` - WebSocket server setup
- `whiteboardWs.ts` - Whiteboard WebSocket handling

### 3. The Core Problem

**Issue**: **Architecture Separation**
- Frontend Convex deployment can access `api.aiAgents.planSessionFocus`
- Backend WebSocket server cannot access `api.aiAgents` (not in generated API)
- WebSocket server runs as separate Node.js process from Convex deployment

**Current Workaround**:
```typescript
// Mock response in tutorWs.ts (lines 469-481)
const plannerResult = {
  success: true,
  data: {
    topic: "Water Cycle",
    learning_goal: "Understanding the basic concepts...",
    approach: "Start with visual explanations...",
    target_mastery: 0.8,
    priority: 5,
    difficulty: "beginner",
    concepts: ["evaporation", "condensation", "precipitation"]
  }
};
```

---

## 🔍 Detailed File Analysis

### Backend Functions (`convex/functions.ts`)

**Exports** (32 functions):
- **Session Management**: `createSessionEnhanced`, `getSessionEnhanced`, `updateSessionContextEnhanced`, etc.
- **Folder Management**: `createFolderEnhanced`, `getFolderEnhanced`, `renameFolderEnhanced`, etc.
- **Database Operations**: `getDatabaseMetrics`, `analyzeQueryPerformance`, `cleanupOldData`
- **Migration**: `validateMigrationData`, `generateMigrationReport`, `testEnhancedFunction`
- **Concept Graph**: `getAllConceptGraphEdges`, `addConceptGraphEdge`, etc.

**Dependencies**:
- Imports from: `sessionCrud`, `folderCrud`, `databaseOptimization`, `migrationValidation`, `conceptGraphCrud`
- Uses: `requireAuth`, `requireAuthAndOwnership`, `getCurrentUser`, `validateSessionAccess`, `checkRateLimit`

### AI Agents (`convex/aiAgents.ts`)

**Exports** (8 actions):
- `initializeAgents` - Initialize AI agent system
- `analyzeDocuments` - Document analysis agent
- `planSessionFocus` - **🎯 THE MISSING PIECE** - Session planning agent
- `analyzeSessionPerformance` - Session analysis agent
- `runCompleteAgentWorkflow` - Complete agent workflow
- `getAgentStatus` - Agent system status
- `getPerformanceMetrics` - Performance metrics

**Dependencies**:
- Imports from: `./agents` (plannerAgent, analyzerAgent, etc.)
- Uses: `api.functions.getSessionEnhanced`, `api.functions.updateSessionContextEnhanced`

### Authentication (`convex/auth.ts`)

**Configuration**:
- Uses `@convex-dev/auth/server` with Password provider
- JWT verification with Supabase fallback support
- WebSocket authentication helper
- Rate limiting implementation

**Key Functions**:
- `requireAuth`, `requireAuthAndOwnership`, `getCurrentUser`
- `authenticateWebSocket` - Used by WebSocket server
- `validateSessionAccess`, `checkRateLimit`

### Database Schema (`convex/schema.ts`)

**Tables** (33 total):
- **Core**: `folders`, `sessions`, `session_messages`, `whiteboard_snapshots`
- **Concepts**: `concept_events`, `concept_graph`
- **Files**: `uploaded_files`
- **Analytics**: `interaction_logs`, `edge_logs`, `tool_metrics`, `token_usage`
- **System**: `background_jobs`, `performance_metrics`, `cache_entries`, `system_config`
- **Auth**: From `@convex-dev/auth/server`

**Indexes**: Comprehensive indexing for performance optimization

### Frontend Integration (`frontend/src/lib/api.ts`)

**Usage Pattern**:
```typescript
import { api as convexApi } from '../../convex/_generated/api';

// Session operations
const res = await convex.mutation(convexApi.functions.createSessionEnhanced, { ... });
const sessions = await convex.query(convexApi.functions.listUserSessionsEnhanced, { ... });

// File operations  
const uploadUrl = await convex.mutation(convexApi.functions.generateFileUploadUrl);
```

**Enhanced vs Basic Fallback**:
- Frontend attempts enhanced functions first
- Falls back to basic functions if enhanced fails
- Provides graceful degradation

---

## 🚨 Migration Requirements

### 1. File Structure Requirements

**New Unified Structure** (REVISED):
```
convex/ (unified deployment - run from root with: npx convex dev)
├── _generated/
├── agents/              # AI agents (existing)
│   ├── plannerAgent.ts
│   ├── analyzerAgent.ts
│   └── ...
├── auth/               # Authentication functions
│   ├── index.ts        # Main auth exports
│   ├── config.ts       # Auth configuration
│   └── websocket.ts    # WebSocket auth
├── api/                # API endpoints and HTTP
│   ├── http.ts         # HTTP router
│   └── endpoints/      # Individual endpoint modules
├── database/           # Database operations
│   ├── schema.ts       # Database schema
│   ├── sessions.ts     # Session CRUD
│   ├── folders.ts      # Folder CRUD
│   └── optimization.ts # DB optimization
├── websocket/          # WebSocket functions
│   ├── tutorWs.ts      # Main tutor WebSocket
│   ├── whiteboardWs.ts # Whiteboard WebSocket
│   └── server.ts       # WebSocket server
├── core/               # Core business logic
│   └── utils.ts        # Shared utilities
├── jobs/               # Background jobs
│   ├── crons.ts        # Cron jobs
│   └── background.ts   # Background tasks
├── functions.ts        # THIN re-export layer (NOT logic)
├── schema.ts           # Re-export unified schema
└── auth.config.ts      # Auth configuration
```

**⚠️ REMOVED**: `convex/frontend/` directory (all Convex functions are backend functions)

### 2. Package.json Strategy (REVISED)

**Root Package.json** (PREFERRED):
```json
{
  "name": "ai-tutor-monorepo",
  "scripts": {
    "dev": "concurrently \"npm run convex:dev\" \"npm run frontend:dev\"",
    "convex:dev": "npx convex dev",
    "convex:deploy": "npx convex deploy", 
    "frontend:dev": "cd frontend && npm run dev",
    "ws:dev": "node convex/websocket/server.js"
  },
  "dependencies": {
    "convex": "^1.24.1",
    "@convex-dev/auth": "^0.0.86",
    "ws": "^8.x.x",
    "ioredis": "^5.x.x", 
    "openai": "^4.x.x",
    "concurrently": "^7.x.x"
  }
}
```

**Deployment Command**: `npx convex dev` (run from project root, targets `convex/` directory)

### 3. Import Path Updates

**Current Problematic Imports**:
```typescript
// In tutorWs.ts - FAILS
import { api } from './_generated/api';
const result = await convexClient.action(api.aiAgents.planSessionFocus, ...);
```

**Target Unified Imports**:
```typescript
// In websocket/tutorWs.ts - WILL WORK
import { api } from '../_generated/api';
const result = await ctx.runAction(api.agents.planSessionFocus, ...);
```

### 4. Function Organization (REVISED)

**Current Issues**:
- `functions.ts` is 1008 lines - too large
- Functions scattered across multiple modules
- Inconsistent naming (Enhanced vs Basic)

**Target Organization**:
```typescript
// convex/functions.ts - THIN re-export layer (NO LOGIC HERE)
export * from './database/sessions';
export * from './database/folders';
export * from './auth';
export * from './agents';
// Just orchestrates modules, doesn't contain implementation

// convex/database/sessions.ts - Actual implementation
export const createSession = mutation({ ... });
export const getSession = query({ ... });
```

---

## 🛠️ Migration Implementation Plan (REVISED)

### Phase 2: Unified Convex Setup (Week 1)

#### 2.1 Create New Directory Structure
- [ ] Create `convex/auth/` module
- [ ] Create `convex/api/` module  
- [ ] Create `convex/database/` module
- [ ] Create `convex/websocket/` module
- [ ] Create `convex/core/` module (utilities only)
- [ ] Create `convex/jobs/` module
- [ ] ⚠️ **DO NOT CREATE** `convex/frontend/` (removed from plan)

#### 2.2 Move and Reorganize Functions

**Authentication Module** (`convex/auth/`):
```typescript
// convex/auth/index.ts
export * from './config';
export * from './middleware';
export * from './websocket';

// convex/auth/config.ts  
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({...});

// convex/auth/middleware.ts
export { requireAuth, requireAuthAndOwnership, getCurrentUser };

// convex/auth/websocket.ts
export { authenticateWebSocket };
```

**Database Module** (`convex/database/`):
```typescript
// convex/database/index.ts
export * from './sessions';
export * from './folders';
export * from './schema';

// convex/database/sessions.ts
export { createSession, getSession, updateSessionContext, deleteSession };

// convex/database/folders.ts  
export { createFolder, getFolder, updateFolder, deleteFolder };
```

**API Module** (`convex/api/`):
```typescript
// convex/api/index.ts
export { default } from './http';

// convex/api/http.ts
import { httpRouter } from "convex/server";
// All HTTP endpoints
```

**WebSocket Module** (`convex/websocket/`):
```typescript
// convex/websocket/index.ts
export * from './tutorWs';
export * from './whiteboardWs';

// convex/websocket/tutorWs.ts - MOVED FROM ROOT
// Now can access api.agents.planSessionFocus directly!
```

#### 2.3 Update Configuration (REVISED)

**Root Package.json** (CRITICAL CHANGE):
```json
{
  "name": "ai-tutor-monorepo",
  "scripts": {
    "dev": "concurrently \"npm run convex:dev\" \"npm run frontend:dev\"",
    "convex:dev": "npx convex dev",
    "convex:deploy": "npx convex deploy", 
    "frontend:dev": "cd frontend && npm run dev",
    "ws:dev": "node convex/websocket/server.js"
  },
  "dependencies": {
    "convex": "^1.24.1",
    "@convex-dev/auth": "^0.0.86",
    "ws": "^8.x.x",
    "ioredis": "^5.x.x", 
    "openai": "^4.x.x",
    "concurrently": "^7.x.x"
  }
}
```

**Root Configuration** (`convex/`):
```typescript
// convex/functions.ts - THIN re-export layer (NO LOGIC HERE)
export * from './database';
export * from './auth';
export * from './agents';

// convex/schema.ts - re-export unified schema
export { default } from './database/schema';

// convex/auth.config.ts - re-export auth config
export { default } from './auth/config';
```

**Environment Variables Setup**:
```bash
# For Convex deployment (set via Convex dashboard)
OPENAI_API_KEY=...
JWT_SECRET=...

# For Node.js WebSocket server (.env file)
CONVEX_URL=...
CONVEX_DEPLOY_KEY=...
JWT_SECRET=...
```

### Phase 3: Frontend Migration (Week 1-2)

#### 3.1 Remove Frontend Convex Directory
- [ ] Delete `frontend/convex/` entirely
- [ ] Remove Convex-related scripts from `frontend/package.json`
- [ ] Update environment variables to point to unified deployment

#### 3.2 Update Frontend Imports
```typescript
// OLD: frontend/src/lib/api.ts
import { api as convexApi } from '../../convex/_generated/api';

// NEW: frontend/src/lib/api.ts  
import { api as convexApi } from '../../../convex/_generated/api';
```

#### 3.3 Update Frontend Configuration
```typescript
// frontend/src/lib/convex.ts
export const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL! // Points to unified deployment
);
```

**Frontend Package.json** (UPDATED):
```json
{
  "name": "ai-tutor-frontend",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start"
    // REMOVED: All convex-related scripts
  }
}
```

### Phase 4: Backend/WebSocket Migration (Week 2)

#### 4.1 Move WebSocket to Unified Deployment
```typescript
// convex/websocket/tutorWs.ts (moved from convex/tutorWs.ts)
import { api } from '../_generated/api';

// ✅ THIS WILL NOW WORK!
const plannerResult = await ctx.runAction(api.agents.planSessionFocus, {
  sessionId,
  userId,
  folderId,
  userModelState
});
```

#### 4.2 Update WebSocket Server
```typescript
// convex/websocket/server.ts (moved from convex/wsServer.ts)
// Now runs via: npm run ws:dev (from root package.json)
```

### Phase 5: Testing and Validation (Week 2-3)

#### 5.1 Critical Test Cases
- [ ] **Main Goal**: WebSocket can call planner agent
- [ ] Frontend auth still works
- [ ] File upload still works  
- [ ] Session management still works
- [ ] Whiteboard integration still works
- [ ] `npx convex dev` runs from root successfully

#### 5.2 Performance Validation
- [ ] Function call latency
- [ ] Database query performance
- [ ] WebSocket response times

---

## 🎯 Success Criteria

### Primary Goal (Phase 3.1 Completion)
- [ ] **WebSocket server can directly call `api.agents.planSessionFocus`**
- [ ] Replace mock planner response with real agent call
- [ ] Session focus determination works end-to-end

### Secondary Goals
- [ ] All existing functionality preserved
- [ ] Improved development experience (single deployment)
- [ ] Better performance (direct function calls)
- [ ] Cleaner architecture (no re-exports)
- [ ] Proper monorepo package.json setup

### Validation Tests
```javascript
// Test that will pass after migration
const testPlannerIntegration = async () => {
  const result = await api.agents.planSessionFocus.call({
    sessionId: "test-session-123",
    userId: "test-user-456", 
    folderId: "test-folder-789"
  });
  
  assert(result.success === true);
  assert(result.data.topic !== undefined);
  assert(result.data.learning_goal !== undefined);
};
```

---

## 🚧 Risk Mitigation

### High Risk Areas
1. **Authentication**: Complex JWT/Supabase integration
2. **File Upload**: Convex storage integration
3. **WebSocket**: Real-time connection handling
4. **Database**: Schema and migration consistency
5. **Package.json Setup**: Dependency management in monorepo

### Mitigation Strategies
1. **Incremental Migration**: Move modules one by one
2. **Parallel Testing**: Keep old system running during migration
3. **Rollback Plan**: Ability to revert quickly if issues arise
4. **Comprehensive Testing**: Test each module before proceeding
5. **Environment Variable Validation**: Ensure both Convex and Node.js have required vars

### Monitoring Points
- Function execution times
- WebSocket connection stability  
- Database query performance
- Authentication success rates
- Package dependency resolution

---

## 📁 File Inventory (REVISED)

### Files to Move/Reorganize (18 files)
1. `convex/auth.ts` → `convex/auth/index.ts`
2. `convex/functions.ts` → **SPLIT**: Thin re-export + modular functions
3. `convex/http.ts` → `convex/api/http.ts`
4. `convex/aiAgents.ts` → `convex/agents/index.ts`
5. `convex/tutorWs.ts` → `convex/websocket/tutorWs.ts`
6. `convex/wsServer.ts` → `convex/websocket/server.ts`
7. `convex/whiteboardWs.ts` → `convex/websocket/whiteboardWs.ts`
8. `convex/sessionCrud.ts` → `convex/database/sessions.ts`
9. `convex/folderCrud.ts` → `convex/database/folders.ts`
10. `convex/conceptGraphCrud.ts` → `convex/database/concepts.ts`
11. `convex/databaseOptimization.ts` → `convex/database/optimization.ts`
12. `convex/backgroundJobs.ts` → `convex/jobs/background.ts`
13. `convex/crons.ts` → `convex/jobs/crons.ts`
14. `convex/analytics.ts` → `convex/database/analytics.ts`
15. `convex/sessionManager.ts` → `convex/core/sessionManager.ts`
16. `convex/serviceUtils.ts` → `convex/core/utils.ts`
17. `convex/migrationValidation.ts` → `convex/core/migration.ts`
18. `convex/schema.ts` → `convex/database/schema.ts`

### Files to Delete (7 files)
1. `frontend/convex/functions.ts`
2. `frontend/convex/auth.ts`
3. `frontend/convex/http.ts`
4. `frontend/convex/aiAgents.ts`
5. `frontend/convex/schema.ts`
6. `frontend/convex/auth.config.ts`
7. `frontend/convex/README.md`

### Files to Update (6+ files)
1. `frontend/src/lib/api.ts` - Update import paths
2. `frontend/src/lib/convex.ts` - Update client config
3. `frontend/package.json` - Remove Convex scripts
4. `package.json` (root) - Add all dependencies and scripts
5. All frontend components using Convex API
6. `.env` files - Environment variable setup

---

## 📅 Timeline Estimate (UNCHANGED)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| **Phase 2: Setup** | 3-4 days | New directory structure, function reorganization |
| **Phase 3: Frontend** | 2-3 days | Updated frontend configuration and imports |
| **Phase 4: Backend** | 2-3 days | WebSocket migration, planner integration |
| **Phase 5: Testing** | 3-4 days | Comprehensive testing and validation |
| **Total** | **10-14 days** | **Unified Convex deployment with working planner** |

---

## ✅ Next Actions (UPDATED)

1. **Immediate** (Today): Proceed with Phase 2.1 - Create directory structure (NO convex/frontend/)
2. **Day 1-2**: Phase 2.2 - Move and reorganize authentication module  
3. **Day 3-4**: Phase 2.3 - Update root package.json and dependency management
4. **Day 5-6**: Phase 3 - Frontend migration and import path updates
5. **Day 7-8**: Phase 4 - WebSocket migration and planner integration
6. **Day 9-10**: Phase 5 - Testing and validation

**Ready to begin implementation with refined approach?** 🚀 