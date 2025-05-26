# Complete Migration Plan: Python + Supabase → Convex Backend

## 🎯 **Migration Overview**

**Current State**: ~30% complete
- ✅ Schema, basic CRUD, HTTP endpoints  
- 🔄 Partial board/session management
- ❌ AI agents, WebSockets, complex workflows

**Target**: Full Node.js + Convex backend replacing Python FastAPI + Supabase

---

## 📋 **Phase 1: Core Infrastructure (Week 1)**

**🎯 Phase Goal**: Establish solid foundation for all subsequent development
**🔗 Dependencies**: None (can start immediately)
**🚫 Blocks**: All subsequent phases depend on this

### 1.1 Environment Setup & Dependencies
**Status**: ❌ Not Started  
**Priority**: 🔴 Critical

**Tasks:**
- [ ] Create root `package.json` for backend services
- [ ] Install Node.js equivalents for Python dependencies:
  ```json
  {
    "dependencies": {
      "openai": "^4.40.2",
      "ws": "^8.16.0", 
      "ioredis": "^5.3.2",
      "node-cron": "^3.0.3",
      "express": "^4.18.2",
      "zod": "^3.22.4",
      "@types/ws": "^8.5.10"
    }
  }
  ```
- [ ] Configure TypeScript build system
- [ ] Set up environment variables for Convex deployment

**✅ Validation Tests:**
- [ ] `npm install` runs without errors
- [ ] `tsc --noEmit` passes type checking
- [ ] `convex dev` starts successfully
- [ ] Environment variables are properly loaded and accessible
- [ ] Basic Convex function deploys and executes

### 1.2 Session Manager Migration
**Status**: 🔄 Partial (basic session CRUD done)  
**Priority**: 🔴 Critical

**Tasks:**
- [ ] Port `backend/ai_tutor/session_manager.py` → `convex/sessionManager.ts`
- [ ] Implement session state management with proper TypeScript types
- [ ] Add session validation and lifecycle management
- [ ] Create session context caching layer

**Files to migrate:**
- `session_manager.py` (251 lines) → Enhanced `sessionManager.ts`

**✅ Validation Tests:**
- [ ] Unit tests: Create/read/update session context with proper validation
- [ ] Integration test: Session lifecycle from creation to cleanup
- [ ] Load test: Handle 100 concurrent session operations
- [ ] Error handling: Invalid session IDs return proper errors
- [ ] Type safety: All TutorContext fields properly typed and validated

---

## 📋 **Phase 2: WebSocket Infrastructure (Week 1-2)**

**🎯 Phase Goal**: Enable real-time communication for tutoring and whiteboard
**🔗 Dependencies**: Phase 1 (Core Infrastructure) must be complete
**🚫 Blocks**: Real-time tutoring features, collaborative whiteboard
**⚠️ Risk**: High complexity, critical for user experience

### 2.1 WebSocket Server Setup  
**Status**: ❌ Not Started  
**Priority**: 🔴 Critical (blocks real-time features)

**Tasks:**
- [ ] Create WebSocket server in `convex/wsServer.ts`
- [ ] Implement connection management and authentication
- [ ] Set up message routing and validation
- [ ] Add connection pooling and cleanup

**✅ Validation Tests:**
- [ ] Connection test: Establish and close WebSocket connections
- [ ] Authentication test: JWT validation on connection
- [ ] Message routing test: Route messages to correct handlers
- [ ] Connection cleanup test: Proper cleanup on disconnect
- [ ] Load test: Handle 50 concurrent WebSocket connections

### 2.2 Tutor WebSocket Endpoints
**Status**: ❌ Not Started  
**Priority**: 🔴 Critical

**Tasks:**
- [ ] Port `tutor_ws.py` (1,481 lines) → `convex/tutorWs.ts`
- [ ] Implement real-time tutoring session handling
- [ ] Add streaming response support for AI interactions
- [ ] Message queueing and delivery guarantees

**✅ Validation Tests:**
- [ ] End-to-end test: Complete tutoring session over WebSocket
- [ ] Streaming test: AI response streaming works correctly
- [ ] Message queuing test: Messages delivered in correct order
- [ ] Error recovery test: Handle AI API failures gracefully
- [ ] Session state test: Context updates propagate correctly

### 2.3 Whiteboard WebSocket Endpoints  
**Status**: ❌ Not Started  
**Priority**: 🟡 High

**Tasks:**
- [ ] Port `whiteboard_ws.py` (290 lines) → `convex/whiteboardWs.ts`
- [ ] Real-time collaborative whiteboard sync
- [ ] Implement Yjs document synchronization
- [ ] Add conflict resolution for concurrent edits

**Files to migrate:**
- `tutor_ws.py` (1,481 lines) → `convex/tutorWs.ts`
- `whiteboard_ws.py` (290 lines) → `convex/whiteboardWs.ts`

**✅ Validation Tests:**
- [ ] Collaboration test: Multiple users editing whiteboard simultaneously
- [ ] Yjs sync test: Document state stays consistent across clients
- [ ] Conflict resolution test: Concurrent edits resolve correctly
- [ ] Snapshot test: Whiteboard snapshots save and restore properly
- [ ] Performance test: Handle complex whiteboard operations smoothly

---

## 📋 **Phase 3: AI Agent System (Week 2-3)**

### 3.1 Core Agent Framework
**Status**: ❌ Not Started  
**Priority**: 🔴 Critical (core business logic)

**Tasks:**
- [ ] Create base agent framework in `convex/agents/`
- [ ] Port agent models from `backend/ai_tutor/agents/models.py`
- [ ] Implement OpenAI integration with proper error handling
- [ ] Add agent execution context and state management

**✅ Validation Tests:**
- [ ] OpenAI integration test: Successful API calls with proper error handling
- [ ] Agent model test: All Pydantic models converted with type safety
- [ ] Framework test: Base agent can be extended and executed
- [ ] Context test: Agent execution context properly managed
- [ ] Rate limiting test: API rate limits handled gracefully

### 3.2 Individual Agent Migration
**Status**: ❌ Not Started  
**Priority**: 🔴 Critical

**Tasks:**
- [ ] Port `analyzer_agent.py` (297 lines) → `convex/agents/analyzerAgent.ts`
- [ ] Port `planner_agent.py` (275 lines) → `convex/agents/plannerAgent.ts` 
- [ ] Port `session_analyzer_agent.py` (484 lines) → `convex/agents/sessionAnalyzerAgent.ts`
- [ ] Implement agent orchestration and workflow management

**✅ Validation Tests:**
- [ ] Analyzer agent test: Document analysis produces same results as Python
- [ ] Planner agent test: Lesson plans match expected structure and quality
- [ ] Session analyzer test: Session analysis maintains accuracy
- [ ] Orchestration test: Agents communicate and coordinate properly
- [ ] Regression test: Compare outputs with Python implementation

### 3.3 AI Agent Integration
**Status**: ❌ Not Started  
**Priority**: 🟡 High

**Tasks:**
- [ ] Create agent registry and factory patterns
- [ ] Implement agent communication protocols
- [ ] Add agent performance monitoring and logging
- [ ] Create agent configuration management

**Files to migrate:**
- `agents/analyzer_agent.py` (297 lines)
- `agents/planner_agent.py` (275 lines)  
- `agents/session_analyzer_agent.py` (484 lines)
- `agents/models.py` (169 lines)

**✅ Validation Tests:**
- [ ] Registry test: All agents properly registered and discoverable
- [ ] Factory test: Agents created with correct configurations
- [ ] Communication test: Agent-to-agent messaging works
- [ ] Monitoring test: Performance metrics captured correctly
- [ ] Configuration test: Dynamic agent configuration updates

---

## 📋 **Phase 4: Complex Workflow Endpoints (Week 3-4)**

### 4.1 Tutor API Endpoints
**Status**: ❌ Not Started  
**Priority**: 🔴 Critical

**Tasks:**
- [ ] Port `tutor.py` (449 lines) → `convex/tutorEndpoints.ts`
- [ ] Document upload and analysis workflows
- [ ] Lesson plan generation endpoints
- [ ] Quiz creation and management
- [ ] Student interaction tracking

**✅ Validation Tests:**
- [ ] Document upload test: Various file formats upload and process correctly
- [ ] Analysis workflow test: End-to-end document analysis pipeline
- [ ] Lesson generation test: Quality lesson plans generated from documents
- [ ] Quiz functionality test: Quiz creation, submission, and grading
- [ ] API compatibility test: All endpoints match Python API responses

### 4.2 Advanced Board Management
**Status**: 🔄 Partial (getBoardSummary exists)  
**Priority**: 🟡 High

**Tasks:**
- [ ] Complete `board_summary.py` (213 lines) → `convex/boardSummary.ts`
- [ ] Implement Yjs snapshot management
- [ ] Add board analytics and insights
- [ ] Whiteboard content analysis integration

### 4.3 File Upload & Processing
**Status**: 🔄 Partial (basic functions exist)  
**Priority**: 🟡 High

**Tasks:**
- [ ] Enhance file upload manager in `convex/fileUploadManager.ts`
- [ ] Implement document processing pipeline
- [ ] Add support for multiple file formats
- [ ] Create embedding generation for documents

**Files to migrate:**
- `tutor.py` (449 lines) → `convex/tutorEndpoints.ts`
- `board_summary.py` (213 lines) → Enhanced `convex/boardSummary.ts`

---

## 📋 **Phase 5: Background Jobs & Services (Week 4-5)**

### 5.1 Job Processing System
**Status**: ❌ Not Started  
**Priority**: 🟡 High

**Tasks:**
- [ ] Create job queue system using Convex scheduled functions
- [ ] Port background task processing from Python
- [ ] Implement retry logic and error handling
- [ ] Add job monitoring and status tracking

### 5.2 Service Layer Migration
**Status**: ❌ Not Started  
**Priority**: 🟡 High

**Tasks:**
- [ ] Port `services/session_tasks.py` (114 lines)
- [ ] Port `services/whiteboard_utils.py` (120 lines) 
- [ ] Port `services/spatial_index.py` (144 lines)
- [ ] Port `services/layout_allocator.py` (251 lines)

### 5.3 Analytics & Telemetry
**Status**: ❌ Not Started  
**Priority**: 🟢 Medium

**Tasks:**
- [ ] Port telemetry system to Node.js
- [ ] Implement performance monitoring
- [ ] Add error tracking and alerting
- [ ] Create usage analytics dashboard

**Files to migrate:**
- `services/session_tasks.py` (114 lines)
- `services/whiteboard_utils.py` (120 lines)
- `services/spatial_index.py` (144 lines) 
- `services/layout_allocator.py` (251 lines)

---

## 📋 **Phase 6: Frontend Integration (Week 5-6)**

### 6.1 API Client Updates
**Status**: 🔄 Partial (Convex client exists)  
**Priority**: 🟡 High

**Tasks:**
- [ ] Update frontend to use new Convex endpoints
- [ ] Replace Supabase client calls with Convex
- [ ] Update WebSocket connection logic
- [ ] Add proper error handling for new API

### 6.2 Authentication Migration
**Status**: 🔄 Partial (Convex auth configured)  
**Priority**: 🟡 High

**Tasks:**
- [ ] Complete JWT key generation setup (generateKeys.mjs exists)
- [ ] Update frontend auth flow to use Convex auth
- [ ] Migrate user session management
- [ ] Update authorization middleware

### 6.3 State Management Updates
**Status**: ❌ Not Started  
**Priority**: 🟢 Medium

**Tasks:**
- [ ] Update frontend stores to work with Convex
- [ ] Implement optimistic updates where appropriate
- [ ] Add proper cache invalidation
- [ ] Update real-time subscription logic

---

## 📋 **Phase 7: Testing & Cleanup (Week 6-7)**

### 7.1 Testing Infrastructure
**Status**: ❌ Not Started  
**Priority**: 🟡 High

**Tasks:**
- [ ] Port existing pytest tests to Jest/Vitest
- [ ] Create integration tests for API endpoints
- [ ] Add WebSocket connection testing
- [ ] Implement end-to-end test scenarios

### 7.2 Performance Optimization  
**Status**: ❌ Not Started  
**Priority**: 🟢 Medium

**Tasks:**
- [ ] Optimize database queries and indexes
- [ ] Implement proper caching strategies
- [ ] Add connection pooling and rate limiting
- [ ] Performance testing and monitoring

### 7.3 Legacy Cleanup
**Status**: ❌ Not Started  
**Priority**: 🟢 Medium

**Tasks:**
- [ ] Remove Supabase dependencies
- [ ] Delete Python backend files
- [ ] Update deployment scripts
- [ ] Clean up environment variables

---

## 🚀 **Implementation Strategy**

**⚠️ RECOMMENDED CHANGE**: Consider **incremental migration** instead of complete rewrite:

### Alternative Approach: Feature-by-Feature Migration
1. **Week 1-2**: Migrate WebSocket & real-time features (highest UX impact)
2. **Week 3-4**: Migrate session management (foundation)  
3. **Week 5-6**: Migrate AI agents (complex but contained)
4. **Week 7-8**: Migrate remaining endpoints

This reduces risk and provides UX benefits earlier.

### Original Timeline (if full migration preferred):

### Week 1: Foundation
- Set up Node.js environment
- Complete session manager migration  
- Start WebSocket infrastructure

### Week 2: Real-time Features
- Complete WebSocket endpoints
- Begin AI agent system migration
- Test real-time functionality

### Week 3: AI Core
- Complete agent system migration
- Implement agent orchestration
- Start complex workflow endpoints

### Week 4: Business Logic  
- Complete tutor API endpoints
- Finish board management features
- Implement file processing

### Week 5: Services & Jobs
- Complete background job system
- Finish service layer migration
- Add monitoring and analytics

### Week 6: Integration
- Complete frontend integration
- Finalize authentication migration
- Performance testing

### Week 7: Testing & Launch
- Complete test coverage
- Performance optimization
- Legacy cleanup and go-live

---

## 📊 **Migration Metrics**

**Total Lines to Migrate**: ~3,500 lines of Python code
**Estimated Effort**: 6-7 weeks (1 developer)
**Risk Level**: Medium (well-defined scope, existing schema)

**Critical Dependencies:**
1. Session Manager → WebSockets → AI Agents → Complex Endpoints
2. Authentication must be completed early
3. WebSocket infrastructure blocks real-time features

**🚨 Risk Mitigation & Rollback Strategy:**
- [ ] **Blue-Green Deployment**: Run Convex backend parallel to Python
- [ ] **Feature Flags**: Toggle between Python and Convex per feature
- [ ] **Database Migration**: Gradual migration with data sync validation
- [ ] **Monitoring**: Comprehensive metrics to detect issues early
- [ ] **Rollback Plan**: Ability to revert within 15 minutes if issues arise

**✅ Success Criteria:**
- [ ] All Python endpoints migrated to Convex
- [ ] Real-time features working (WebSockets)
- [ ] AI tutoring functionality preserved
- [ ] Performance equal or better than Python backend
- [ ] Zero downtime migration
- [ ] All validation tests pass for each phase 