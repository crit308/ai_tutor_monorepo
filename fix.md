# AI Tutor Migration Plan: Phase 3 - Core AI Logic (Updated)

## Current Status Assessment

Based on analysis of the codebase, here's what's already implemented vs. what needs migration:

### ✅ Already Completed:
1. **File Upload & Processing**: Successfully migrated to Convex
2. **Knowledge Base Generation**: Document analysis working via Convex actions
3. **Basic Agent Framework**: TypeScript agent base classes and types defined
4. **Planner Agent Structure**: Partial implementation in `convex/agents/plannerAgent.ts`
5. **WebSocket Infrastructure**: Basic tutor WebSocket handler in `convex/tutorWs.ts`
6. **Session Management**: Session context management partially implemented

### 🔄 Phase 3.1 Status - Partially Complete:
1. **Planner Agent Implementation**: ✅ **COMPLETE** - `convex/agents/plannerAgent.ts` fully implemented
2. **Session Context Loading**: ✅ **COMPLETE** - `hydrateInitialState` loads session context from Convex
3. **Convex Deployment Architecture**: ⚠️ **DISCOVERED ISSUE** - Frontend runs Convex deployment, backend needs proper integration
4. **Planner Integration in WebSocket**: 🔄 **WORKAROUND IMPLEMENTED** - Using mock response until deployment issue resolved

### ❌ Still Needs Migration:
1. **Complete Executor Logic**: Core decision-making loop from Python
2. **Skills System**: 33+ Python skills need TypeScript migration
3. **Tool Call Dispatch**: Robust skill execution and response handling
4. **User Model Updates**: Context persistence and state management
5. **Convex Action Calling**: Fix backend-to-frontend Convex action calls

## Revised Migration Strategy

### **IMPORTANT ARCHITECTURAL DISCOVERY**: 
The Convex deployment runs from `frontend/` directory (`cd frontend; npx convex dev`), while the WebSocket server runs from the backend. The frontend Convex project re-exports backend functions using `"backend-convex/*": ["../../convex/*"]` path mapping. This creates a deployment separation that needs to be resolved.

### **Immediate Action Required** - Fix Convex Integration:
**Option A** (Recommended): Move WebSocket server to frontend deployment
**Option B**: Set up proper HTTP calls from backend to frontend Convex deployment
**Option C**: Unify Convex deployment architecture

### Core Architectural Decisions (Updated)

1. **Planner Agent**: Convex action (`api.aiAgents.planSessionFocus`) ✅ **IMPLEMENTED**
2. **Executor Logic**: Node.js WebSocket server (`convex/tutorWs.ts`) 🔄 **NEEDS CONVEX FIX**
3. **Skills**: TypeScript modules in `convex/skills/` executed by Node.js ❌ **NOT STARTED**
4. **Database Integration**: Skills call Convex queries/mutations for data ❌ **PENDING CONVEX FIX**

## Phase 3: Detailed Implementation Plan

### Phase 3.1: Complete Planner Agent Integration ⏱️ 2-3 days

**Objective**: Finish the planner agent and integrate it into the WebSocket flow

**Key Tasks**:
1. **Complete `convex/agents/plannerAgent.ts`**:
   - Fix concept graph queries to use actual Convex queries
   - **Knowledge Base Reading**: Read from `agentContext.analysis_result.analysis_text` (populated by `analyzeDocuments` action)
   - Add robust error handling and validation

2. **Enhance `convex/aiAgents.ts`**:
   - Ensure `planSessionFocus` action works end-to-end
   - Add proper session context updates
   - **Concept Graph Caching**: Implement in-memory cache within the Convex action for concept graph data

3. **Update `convex/tutorWs.ts`**:
   - Add planner invocation on session start and when needed
   - Implement focus objective persistence
   - Add proper context hydration from Convex

**Expected Output**: Working planner that determines session focus and updates session context

### Phase 3.2: Core Executor Implementation ⏱️ 4-5 days

**Objective**: Implement the lean executor decision-making loop in TypeScript

**Key Tasks**:
1. **Create Executor Prompt System**:
   ```typescript
   // convex/prompts.ts
   export const LEAN_EXECUTOR_PROMPT_TEMPLATE = `...` // Port from Python
   ```

2. **Implement Core Executor Functions in `tutorWs.ts`**:
   ```typescript
   async function _run_executor_turn(ctx: AgentContext, ws: WebSocket)
   async function _dispatch_tool_call(call: ToolCall, ctx: AgentContext, ws: WebSocket)
   async function _build_lean_prompt(ctx: AgentContext, objective: FocusObjective)
   ```

3. **Add OpenAI Integration**:
   - **Node.js OpenAI Client**: Initialize separate OpenAI client instance in `tutorWs.ts` (distinct from Convex actions)
   - Implement JSON response parsing and validation
   - Add retry logic for failed LLM calls

4. **Enhance Message Handling**:
   - Complete `handleUserMessage` in `tutorWs.ts`
   - **History Management**: Update `ctx.history` with user messages before `_run_executor_turn`, and assistant ToolCall after LLM response
   - **Context Persistence**: Load from Convex at message start, manipulate in-memory, persist back at message end

**Expected Output**: Working executor that can process user messages and make tool calls

### Phase 3.3: Skills System Migration ⏱️ 6-8 days

**Objective**: Port Python skills to TypeScript and integrate with executor

**Priority Skills Migration Order**:

1. **Core Communication Skills** (Day 1-2):
   - `explain_concept.ts` - Core explanation generation
   - `answer_question.ts` - Direct question answering
   - `create_quiz.ts` - Quiz question generation
   - `evaluate_quiz.ts` - Answer evaluation with user model updates

2. **User Model & Context Skills** (Day 2-3):
   - `update_user_model.ts` - Core user progress tracking
   - `get_user_model_status.ts` - Progress retrieval
   - `reflect_on_interaction.ts` - Session analysis

3. **Basic Whiteboard Skills** (Day 3-4):
   - `clear_whiteboard.ts` - Board clearing
   - `get_board_state.ts` - **WebSocket message handler** (not traditional skill, handled in `tutorWs.ts`)
   - `get_board_summary.ts` - Board analysis
   - `draw_text.ts` - Basic text drawing
   - `draw_shape.ts` - Basic shape drawing

4. **Advanced Whiteboard Skills** (Day 4-6):
   - `draw_mcq.ts` - Multiple choice question rendering
   - `draw_mcq_feedback.ts` - Quiz feedback display
   - `draw_table.ts` - Table creation
   - `draw_diagram.ts` - Diagram generation
   - `draw_graph.ts` - Graph/chart creation

5. **Specialized Skills** (Day 6-8):
   - `layout_board_ops.ts` - Advanced board operations (**in-memory LayoutAllocator for Phase 3**)
   - `drawing_tools.ts` - Primitive drawing functions
   - `whiteboard_grouping.ts` - Object grouping
   - `advanced_whiteboard.ts` - Highlighting and pointers

**Skills Architecture**:
```typescript
// convex/skills/types.ts
export interface SkillContext {
  convex: ConvexClient; // For database operations
  openai: OpenAI; // For LLM calls
  agentContext: AgentContext;
}

export interface SkillResult<T = any> {
  data: T;
  whiteboard_actions?: WhiteboardAction[];
  context_updates?: Partial<AgentContext>;
}

// Example skill signature
export async function explainConcept(
  ctx: SkillContext,
  topic: string,
  details?: string
): Promise<SkillResult<ExplanationResponse>>
```

### Phase 3.4: Tool Call Dispatch System ⏱️ 2-3 days

**Objective**: Complete the tool dispatch mechanism in the executor

**Key Tasks**:
1. **Implement Simple Switch-Based Dispatch** (initial approach):
   ```typescript
   // in _dispatch_tool_call
   import { explainConcept } from '../skills/explainConcept';
   import { createQuizData } from '../skills/createQuiz';
   
   switch (call.name) {
       case 'explain_concept':
           return await explainConcept(skillCtx, call.args.topic, call.args.details);
       case 'create_quiz':
           return await createQuizData(skillCtx, call.args.topic);
       // ... more cases
   }
   ```
   *Note: Can refactor to dynamic registry later for flexibility*

2. **Complete `_dispatch_tool_call`**:
   - **SkillContext Creation**: Populate with `ConvexClient`, `OpenAI`, and `AgentContext` instances
   - Response data validation and transformation
   - Whiteboard action processing
   - Error handling and fallbacks

3. **Add Frontend Tool Handlers**:
   - **Direct WebSocket responses** via `safeSendJson` for immediate UI updates
   - Message queuing for streaming responses
   - State synchronization

**Expected Output**: Complete tool dispatch system that can execute any skill

### Phase 3.5: Integration & Testing ⏱️ 3-4 days

**Objective**: End-to-end integration and comprehensive testing

**Key Tasks**:
1. **Session Flow Integration**:
   - Complete session initialization with planner
   - Executor turn cycle with context persistence
   - Proper cleanup and error recovery

2. **Database Integration**:
   - Skills reading from Convex queries
   - Skills writing via Convex mutations
   - Session context synchronization

3. **Testing & Validation**:
   - Unit tests for core skills
   - Integration tests for executor flow
   - End-to-end WebSocket testing
   - Performance optimization

## Technical Implementation Details

### Database Schema Extensions Needed

1. **User Model Storage**:
   ```typescript
   // Add to convex/schema.ts
   user_models: defineTable({
     user_id: v.string(),
     session_id: v.string(),
     concepts: v.any(), // JSON object with concept states
     overall_progress: v.number(),
     last_updated: v.number(),
   })
   ```

2. **Enhanced Session Context**:
   ```typescript
   // Update sessions table context_data field to include:
   {
     analysis_result: AnalysisResult,
     focus_objective: FocusObjective,
     user_model_state: UserModelState,
     history: Array<{role: string, content: string}>,
     current_quiz_question: QuizQuestion | null,
     last_pedagogical_action: string | null
   }
   ```

### Environment Configuration

1. **Node.js Server Environment Variables**:
   ```env
   OPENAI_API_KEY=sk-...
   CONVEX_URL=https://...
   CONVEX_DEPLOY_KEY=...
   ```

2. **Convex Action Environment Variables**:
   ```env
   OPENAI_API_KEY=sk-...
   ```

### Performance Considerations

1. **Skill Execution**:
   - Skills run in Node.js for low latency
   - Database calls optimized for minimal round trips
   - Caching for frequently accessed data
   - **Circuit breaker pattern** for Convex calls from Node.js skills
   - **Skill timeout handling** for long-running operations

2. **Context Management**:
   - **In-memory context pattern**: Load from Convex at WebSocket message start → manipulate in-memory → persist at message end
   - **SessionManager cache**: Convex-side caching for frequent session data access
   - Cleanup on session end

3. **WebSocket Optimization**:
   - Message queuing for rapid responses
   - Streaming for long-running operations
   - **Connection pooling** for Convex client from Node.js environment

## Risk Mitigation

1. **Incremental Migration**:
   - Migrate skills in priority order
   - Maintain Python fallbacks during transition
   - Feature flags for new vs. old system

2. **Error Handling**:
   - Graceful degradation when skills fail
   - Comprehensive logging and monitoring
   - User-friendly error messages

3. **Testing Strategy**:
   - Unit tests for each skill
   - Integration tests for executor flow
   - Load testing for WebSocket performance

## Success Criteria

### Phase 3.1 Complete:
- [ ] Planner agent determines session focus
- [ ] Focus objective stored in session context
- [ ] WebSocket calls planner when needed

### Phase 3.2 Complete:
- [ ] Executor processes user messages
- [ ] LLM generates valid tool calls
- [ ] Basic tool dispatch working

### Phase 3.3 Complete:
- [ ] Core skills (explain, quiz, user model) working
- [ ] Basic whiteboard skills operational
- [ ] Advanced whiteboard skills functional

### Phase 3.4 Complete:
- [ ] All skills integrated with dispatch system
- [ ] Frontend tools working correctly
- [ ] Error handling robust

### Phase 3.5 Complete:
- [ ] End-to-end session flow working
- [ ] All Python functionality replicated
- [ ] Performance meets requirements
- [ ] Ready for production deployment

## Estimated Timeline: 18-23 days total

## Key Data Flow Clarifications

### SkillContext Population in `tutorWs.ts`
The `_dispatch_tool_call` function in `tutorWs.ts` will be responsible for:
1. **ConvexClient Instance**: Initialized and configured to talk to your Convex deployment
2. **OpenAI Client Instance**: Separate from Convex actions, configured for Node.js environment  
3. **SkillContext Creation**: Populate and pass to skill functions:
   ```typescript
   const skillCtx: SkillContext = {
     convex: convexClient,     // For database operations
     openai: openaiClient,     // For LLM calls
     agentContext: ctx         // Current session's full AI context
   };
   ```

### Context Management Pattern
- **Load**: `sessionManager.getSessionContext()` at WebSocket message start
- **Manipulate**: In-memory operations during executor turn and skill execution
- **Persist**: `sessionManager.updateSessionContext()` at message end
- **Cache**: SessionManager maintains Convex-side cache for frequent access

This plan provides a comprehensive roadmap for completing the AI tutor migration from Python to TypeScript/Convex while maintaining the same functionality and improving performance through the new architecture.