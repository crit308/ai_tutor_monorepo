## Implementation Plan for Option C: Unified Convex Deployment

### Phase 1: Preparation and Analysis
**Goal**: Understand current state and prepare for migration

#### 1.1 Create Backup and Documentation
- [ ] Document current frontend Convex configuration
- [ ] Create backup of current working state
- [ ] Document all current path mappings and dependencies

#### 1.2 Analysis Tasks
- [ ] Audit all functions in `convex/` directory to understand dependencies
- [ ] Identify frontend-specific vs backend-specific functions
- [ ] Map all current import paths in both frontend and backend
- [ ] Identify any conflicting function names or exports

### Phase 2: Unified Convex Setup
**Goal**: Create the new unified Convex deployment structure

#### 2.1 Create Unified Convex Directory Structure
```
convex/ (new unified structure)
├── _generated/
├── agents/              # AI agents (existing)
├── auth/               # Authentication functions
├── api/                # API endpoints and HTTP functions  
├── database/           # Database operations and CRUD
├── websocket/          # WebSocket-related functions
├── frontend/           # Frontend-specific functions
├── jobs/               # Background jobs and crons
├── schema.ts           # Unified schema
├── auth.config.ts      # Auth configuration
└── package.json        # Dependencies
```

#### 2.2 Move and Reorganize Functions
- [ ] **Auth Module**: Consolidate `convex/auth.ts` with any frontend auth
- [ ] **Core Functions**: Reorganize `convex/functions.ts` into logical modules
- [ ] **AI Agents**: Keep existing `convex/agents/` structure
- [ ] **HTTP Endpoints**: Consolidate HTTP handlers
- [ ] **Schema**: Merge any frontend-specific schema additions

#### 2.3 Update Configuration Files
- [ ] Create new `convex.json` in root directory
- [ ] Update `convex/package.json` with all required dependencies
- [ ] Create unified `convex/tsconfig.json`
- [ ] Set up proper environment variable handling

### Phase 3: Frontend Migration
**Goal**: Update frontend to use unified deployment

#### 3.1 Update Frontend Configuration
- [ ] Remove `frontend/convex/` directory
- [ ] Update `frontend/package.json` Convex scripts to point to root
- [ ] Update import paths in frontend components
- [ ] Update Convex client initialization

#### 3.2 Update Import Paths
- [ ] Change all `api.*` imports to use new unified structure
- [ ] Update authentication setup to use unified auth module
- [ ] Update any direct Convex function calls

#### 3.3 Environment Configuration
- [ ] Update environment variables for unified deployment
- [ ] Update deployment scripts and CI/CD if applicable

### Phase 4: Backend/WebSocket Migration  
**Goal**: Update backend services to use unified deployment

#### 4.1 Update WebSocket Server
- [ ] Move `convex/tutorWs.ts` to `convex/websocket/tutorWs.ts`
- [ ] Update imports to use new unified API structure
- [ ] Fix the planner agent call issue (main goal of this migration)
- [ ] Update `convex/wsServer.ts` accordingly

#### 4.2 Update Backend Services
- [ ] Update any backend services using Convex
- [ ] Update import paths for database operations
- [ ] Ensure proper client initialization

### Phase 5: Testing and Validation
**Goal**: Ensure everything works correctly

#### 5.1 Unit Testing
- [ ] Test all migrated functions individually
- [ ] Verify database operations work correctly
- [ ] Test authentication flows

#### 5.2 Integration Testing
- [ ] Test WebSocket server can call planner agent (fix original issue)
- [ ] Test frontend-backend integration
- [ ] Test real-time features and WebSocket communication
- [ ] Verify file upload and session management

#### 5.3 End-to-End Testing
- [ ] Full user session flow testing
- [ ] Whiteboard integration testing
- [ ] AI agent integration testing

### Phase 6: Deployment and Cleanup
**Goal**: Deploy unified system and clean up old structure

#### 6.1 Deployment
- [ ] Deploy unified Convex deployment
- [ ] Update environment configurations
- [ ] Switch frontend to use unified deployment
- [ ] Switch backend services to unified deployment

#### 6.2 Cleanup
- [ ] Remove `frontend/convex/` directory
- [ ] Clean up old configuration files
- [ ] Update documentation
- [ ] Remove temporary migration files

### Phase 7: Validation and Documentation
**Goal**: Ensure system works and document changes

#### 7.1 Final Validation
- [ ] Test Phase 3.1 planner agent integration (original goal)
- [ ] Verify all existing functionality still works
- [ ] Performance testing of unified deployment

#### 7.2 Documentation
- [ ] Update README files
- [ ] Document new architecture
- [ ] Update development setup instructions
- [ ] Create troubleshooting guide

## Key Files That Need Attention

### High Priority (Core Migration)
1. **`convex/schema.ts`** - Needs to include all table definitions
2. **`convex/tutorWs.ts`** - Main WebSocket handler that needs planner access
3. **`convex/agents/plannerAgent.ts`** - The agent that needs to be callable
4. **`frontend/src/lib/convex.ts`** - Client initialization
5. **Authentication setup** - Both frontend and backend auth

### Medium Priority (Functionality)
6. **`convex/functions.ts`** - Core database operations
7. **`convex/aiAgents.ts`** - AI agent exports and actions
8. **HTTP endpoints** - API routes and webhooks
9. **Background jobs** - Cron jobs and async tasks

### Low Priority (Polish)
10. **Testing infrastructure**
11. **Development scripts**
12. **Documentation updates**

## Expected Benefits After Migration

1. **Immediate Fix**: WebSocket server can directly call `api.aiAgents.plannerAgent` 
2. **Simplified Development**: Single deployment to manage
3. **Better Performance**: Direct function calls vs HTTP requests
4. **Easier Debugging**: All logs and errors in one place
5. **Cleaner Architecture**: No more re-export complexity

## Risk Mitigation

1. **Backup Strategy**: Keep current working version as backup
2. **Incremental Migration**: Migrate in phases with testing at each step
3. **Rollback Plan**: Ability to quickly revert to current architecture
4. **Thorough Testing**: Comprehensive testing at each phase

This plan will resolve the architectural issue blocking Phase 3.1 completion and provide a solid foundation for future development.
