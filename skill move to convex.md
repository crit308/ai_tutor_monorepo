# MVP Implementation Roadmap: Whiteboard Skills Consolidation (Convex Migration)

## Overview
**Goal**: Migrate whiteboard skills from Python backend to Convex, reduce skills from 30+ to ≤10, improve performance by 40%+, eliminate session-breaking timeouts
**Timeline**: 3 weeks
**Success Criteria**: ≤10 skills, 40%+ latency improvement, 0 unhandled timeouts in first week, full Convex migration

## Week 1: Consolidated Skills in Convex + Timeout Handling

### Day 1-2: Create Core Educational Skills in Convex

```typescript
// convex/skills/educational_content.ts
import { v } from "convex/values";
import { mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

// Validation schemas using Convex validators
const MCQDataValidator = v.object({
  question: v.string(),
  options: v.array(v.string()),
  correct_index: v.number(),
  explanation: v.optional(v.string()),
});

const TableDataValidator = v.object({
  headers: v.array(v.string()),
  rows: v.array(v.array(v.string())),
  title: v.optional(v.string()),
});

const DiagramDataValidator = v.object({
  diagram_type: v.union(v.literal("flowchart"), v.literal("timeline"), v.literal("coordinate_plane")),
  elements: v.array(v.any()),
  title: v.optional(v.string()),
});

// Main consolidated educational content skill
export const createEducationalContent = action({
  args: {
    content_type: v.union(v.literal("mcq"), v.literal("table"), v.literal("diagram")),
    data: v.any(), // Will be validated internally based on content_type
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();
    
    // Log skill call for metrics
    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "create_educational_content",
      content_type: args.content_type,
      batch_id,
      session_id: args.session_id,
    });

    try {
      let result;
      
      if (args.content_type === "mcq") {
        const mcqData = validateMCQData(args.data);
        result = await createMCQContent(ctx, mcqData, batch_id, args.session_id);
      } else if (args.content_type === "table") {
        const tableData = validateTableData(args.data);
        result = await createTableContent(ctx, tableData, batch_id, args.session_id);
      } else if (args.content_type === "diagram") {
        const diagramData = validateDiagramData(args.data);
        result = await createDiagramContent(ctx, diagramData, batch_id, args.session_id);
      } else {
        throw new Error(`Unknown content_type: ${args.content_type}`);
      }

      const elapsed_ms = Date.now() - start_time;
      
      // Log success metrics
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "create_educational_content",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return result;

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      
      // Log error metrics
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "create_educational_content",
        elapsed_ms,
        error: error.message,
        batch_id,
        session_id: args.session_id,
      });

      // Check if this is a timeout (Convex actions have built-in timeout)
      if (elapsed_ms > 5000) {
        return {
          payload: {
            message_text: "Drawing is taking longer than expected, please try again.",
            message_type: "error"
          },
          actions: []
        };
      }
      
      throw error;
    }
  },
});

async function createMCQContent(ctx: any, data: any, batch_id: string, session_id: string) {
  // Reuse existing MCQ logic from draw_mcq_actions but in Convex
  const specs = await ctx.runAction(api.legacy.drawMCQSpecs, {
    question: data.question,
    options: data.options,
    correct_index: data.correct_index,
    explanation: data.explanation,
    question_id: batch_id,
  });

  const action = {
    type: "ADD_OBJECTS",
    objects: specs,
    batch_id,
  };

  const payload = {
    message_text: `Created multiple choice question: ${data.question.slice(0, 50)}...`,
    message_type: "status_update"
  };

  // Store in Convex database for session history
  await ctx.runMutation(api.sessions.addWhiteboardAction, {
    session_id,
    action,
    payload,
    batch_id,
  });

  return { payload, actions: [action] };
}

function validateMCQData(data: any) {
  // Manual validation since we can't use the validator directly on v.any()
  if (!data.question || typeof data.question !== 'string') {
    throw new Error("Invalid MCQ data: question required");
  }
  if (!Array.isArray(data.options) || data.options.length === 0) {
    throw new Error("Invalid MCQ data: options array required");
  }
  if (typeof data.correct_index !== 'number' || data.correct_index < 0 || data.correct_index >= data.options.length) {
    throw new Error("Invalid MCQ data: valid correct_index required");
  }
  return data;
}

function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
}
```

### Day 3: Timeout Handling and Metrics in Convex

```typescript
// convex/metrics.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const logSkillCall = mutation({
  args: {
    skill: v.string(),
    content_type: v.optional(v.string()),
    batch_id: v.string(),
    session_id: v.string(),
    elapsed_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("skill_metrics", {
      skill: args.skill,
      content_type: args.content_type,
      batch_id: args.batch_id,
      session_id: args.session_id,
      timestamp: Date.now(),
      status: "started",
    });
  },
});

export const logSkillSuccess = mutation({
  args: {
    skill: v.string(),
    elapsed_ms: v.number(),
    batch_id: v.string(),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("skill_metrics", {
      skill: args.skill,
      batch_id: args.batch_id,
      session_id: args.session_id,
      elapsed_ms: args.elapsed_ms,
      timestamp: Date.now(),
      status: "success",
    });
  },
});

export const logSkillError = mutation({
  args: {
    skill: v.string(),
    elapsed_ms: v.number(),
    error: v.string(),
    batch_id: v.string(),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("skill_metrics", {
      skill: args.skill,
      batch_id: args.batch_id,
      session_id: args.session_id,
      elapsed_ms: args.elapsed_ms,
      error: args.error,
      timestamp: Date.now(),
      status: "error",
    });
  },
});

// Timeout wrapper utility for Convex actions
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Query to get active skill count for MVP validation
export const getActiveSkillCount = query({
  args: {},
  handler: async (ctx) => {
    // Get distinct skills used in last 7 days
    const recentSkills = await ctx.db
      .query("skill_metrics")
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 7 * 24 * 60 * 60 * 1000))
      .collect();
    
    const activeSkills = new Set(recentSkills.map(m => m.skill));
    const whiteboardSkills = Array.from(activeSkills).filter(skill => 
      ['create_educational_content', 'batch_whiteboard_operations', 
       'modify_whiteboard_objects', 'clear_whiteboard'].includes(skill)
    );
    
    return {
      total_skills: activeSkills.size,
      whiteboard_skills: whiteboardSkills.length,
      skill_list: Array.from(activeSkills)
    };
  },
});
```

### Day 4-5: Modify Whiteboard Objects Skill in Convex

```typescript
// convex/skills/whiteboard_modifications.ts
import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";

const ObjectUpdateValidator = v.object({
  object_id: v.string(),
  updates: v.any(), // Generic updates object
});

export const modifyWhiteboardObjects = action({
  args: {
    updates: v.array(ObjectUpdateValidator),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    try {
      const update_objects = args.updates.map(update => ({
        objectId: update.object_id,
        updates: update.updates,
      }));

      const action = {
        type: "UPDATE_OBJECTS",
        objects: update_objects,
        batch_id,
      };

      const payload = {
        message_text: `Updated ${args.updates.length} objects on whiteboard.`,
        message_type: "status_update"
      };

      // Store in Convex database
      await ctx.runMutation(api.sessions.addWhiteboardAction, {
        session_id: args.session_id,
        action,
        payload,
        batch_id,
      });

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "modify_whiteboard_objects",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      return { payload, actions: [action] };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "modify_whiteboard_objects",
        elapsed_ms,
        error: error.message,
        batch_id,
        session_id: args.session_id,
      });
      throw error;
    }
  },
});

export const clearWhiteboard = action({
  args: {
    scope: v.union(v.literal("all"), v.literal("selection"), v.literal("mcq"), v.literal("diagrams")),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const batch_id = args.batch_id || generateBatchId();

    const action = {
      type: "CLEAR_CANVAS",
      scope: args.scope,
      batch_id,
    };

    const payload = {
      message_text: `Cleared whiteboard (${args.scope}).`,
      message_type: "status_update"
    };

    await ctx.runMutation(api.sessions.addWhiteboardAction, {
      session_id: args.session_id,
      action,
      payload,
      batch_id,
    });

    return { payload, actions: [action] };
  },
});

function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
}
```

## Week 2: Batching Implementation + Legacy Migration

### Day 6-7: Core Batching Skill in Convex

```typescript
// convex/skills/batch_operations.ts
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const SimpleOperationValidator = v.object({
  operation_type: v.union(
    v.literal("add_text"), 
    v.literal("add_shape"), 
    v.literal("update_object"), 
    v.literal("clear")
  ),
  data: v.any(),
  id: v.optional(v.string()),
});

export const batchWhiteboardOperations = action({
  args: {
    operations: v.array(SimpleOperationValidator),
    batch_id: v.optional(v.string()),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    const batch_id = args.batch_id || generateBatchId();

    await ctx.runMutation(api.metrics.logSkillCall, {
      skill: "batch_whiteboard_operations",
      batch_id,
      session_id: args.session_id,
    });

    try {
      // Group operations by type for efficient batching
      const add_objects: any[] = [];
      const update_objects: any[] = [];
      const clear_actions: any[] = [];

      for (const op of args.operations) {
        try {
          if (op.operation_type === "add_text") {
            const obj_spec = createTextSpec(op.data);
            add_objects.push(obj_spec);
          } else if (op.operation_type === "add_shape") {
            const obj_spec = createShapeSpec(op.data);
            add_objects.push(obj_spec);
          } else if (op.operation_type === "update_object") {
            update_objects.push({
              objectId: op.data.object_id,
              updates: op.data.updates,
            });
          } else if (op.operation_type === "clear") {
            clear_actions.push({
              type: "CLEAR_CANVAS",
              scope: op.data.scope || "all",
            });
          }
        } catch (error) {
          console.error(`Failed to process operation ${op.id}:`, error);
          // Continue with other operations
        }
      }

      // Build consolidated actions
      const actions: any[] = [];

      if (add_objects.length > 0) {
        actions.push({
          type: "ADD_OBJECTS",
          objects: add_objects,
          batch_id,
        });
      }

      if (update_objects.length > 0) {
        actions.push({
          type: "UPDATE_OBJECTS",
          objects: update_objects,
          batch_id,
        });
      }

      actions.push(...clear_actions);

      const payload = {
        message_text: `Executed ${args.operations.length} whiteboard operations.`,
        message_type: "status_update"
      };

      // Store all actions in database
      for (const action of actions) {
        await ctx.runMutation(api.sessions.addWhiteboardAction, {
          session_id: args.session_id,
          action,
          payload,
          batch_id,
        });
      }

      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: "batch_whiteboard_operations",
        elapsed_ms,
        batch_id,
        session_id: args.session_id,
      });

      // Log efficiency metrics
      await ctx.runMutation(api.metrics.logBatchEfficiency, {
        batch_id,
        operations_count: args.operations.length,
        actions_created: actions.length,
        websocket_reduction: (args.operations.length - actions.length) / args.operations.length,
        session_id: args.session_id,
      });

      return { payload, actions };

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: "batch_whiteboard_operations",
        elapsed_ms,
        error: error.message,
        batch_id,
        session_id: args.session_id,
      });
      throw error;
    }
  },
});

function createTextSpec(data: any) {
  return {
    id: data.id || generateBatchId(),
    kind: "text",
    text: data.text,
    x: data.x || 100,
    y: data.y || 100,
    fontSize: data.fontSize || 16,
    fill: data.color || "#000000",
    metadata: { source: "assistant" }
  };
}

function createShapeSpec(data: any) {
  return {
    id: data.id || generateBatchId(),
    kind: data.shape_type,
    x: data.x || 100,
    y: data.y || 100,
    width: data.width || 50,
    height: data.height || 50,
    fill: data.fill || "#ffffff",
    stroke: data.stroke || "#000000",
    metadata: { source: "assistant" }
  };
}

function generateBatchId(): string {
  return Math.random().toString(36).substring(2, 10);
}
```

### Day 8-9: Legacy Python to Convex Migration Bridge

```typescript
// convex/legacy/migration_bridge.ts
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

// Bridge actions to maintain compatibility during migration
export const drawMCQSpecs = action({
  args: {
    question: v.string(),
    options: v.array(v.string()),
    correct_index: v.number(),
    explanation: v.optional(v.string()),
    question_id: v.string(),
  },
  handler: async (ctx, args) => {
    // This recreates the Python draw_mcq_actions logic in TypeScript
    const specs = [];
    
    // Question text object
    specs.push({
      id: `question-${args.question_id}`,
      kind: "text",
      text: args.question,
      x: 50,
      y: 50,
      fontSize: 18,
      fill: "#000000",
      metadata: { 
        source: "assistant",
        role: "question",
        question_id: args.question_id 
      }
    });

    // Option objects
    args.options.forEach((option, index) => {
      // Option selector circle
      specs.push({
        id: `option-selector-${args.question_id}-${index}`,
        kind: "circle",
        x: 50,
        y: 100 + (index * 40),
        radius: 15,
        fill: "#ffffff",
        stroke: "#000000",
        metadata: {
          source: "assistant",
          role: "option_selector",
          option_id: index,
          question_id: args.question_id
        }
      });

      // Option text
      specs.push({
        id: `option-text-${args.question_id}-${index}`,
        kind: "text", 
        text: option,
        x: 80,
        y: 100 + (index * 40),
        fontSize: 14,
        fill: "#000000",
        metadata: {
          source: "assistant",
          role: "option_label",
          option_id: index,
          question_id: args.question_id
        }
      });
    });

    return specs;
  },
});

// Legacy shim actions to redirect old Python skill calls
export const legacyDrawMCQActions = action({
  args: {
    question_data: v.any(),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("Legacy drawMCQActions called, redirecting to createEducationalContent");
    
    const mcqData = {
      question: args.question_data.question,
      options: args.question_data.options,
      correct_index: args.question_data.correct_option_index,
      explanation: args.question_data.explanation,
    };

    return await ctx.runAction(api.skills.educational_content.createEducationalContent, {
      content_type: "mcq",
      data: mcqData,
      session_id: args.session_id,
    });
  },
});
```

### Day 10: Update Agent Integration for Convex

```typescript
// convex/agents/whiteboard_agent.ts
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const executeWhiteboardSkill = action({
  args: {
    skill_name: v.string(),
    skill_args: v.any(),
    session_id: v.string(),
    user_id: v.string(),
  },
  handler: async (ctx, args) => {
    const start_time = Date.now();
    
    try {
      let result;

      // Route to appropriate consolidated skill
      switch (args.skill_name) {
        case "create_educational_content":
        case "draw_mcq":
        case "draw_mcq_actions":
        case "draw_table":
        case "draw_diagram":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        case "batch_whiteboard_operations":
        case "batch_draw":
          result = await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        case "modify_whiteboard_objects":
        case "update_object_on_board":
        case "highlight_object":
          result = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        case "clear_whiteboard":
        case "clear_board":
          result = await ctx.runAction(api.skills.whiteboard_modifications.clearWhiteboard, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        default:
          throw new Error(`Unknown skill: ${args.skill_name}`);
      }

      // Send result to frontend via WebSocket
      await ctx.runMutation(api.websockets.sendToSession, {
        session_id: args.session_id,
        data: result,
      });

      return result;

    } catch (error) {
      console.error(`Skill execution failed:`, error);
      
      // Send error to frontend
      await ctx.runMutation(api.websockets.sendToSession, {
        session_id: args.session_id,
        data: {
          payload: {
            message_text: "I encountered an issue with the whiteboard. Please try again.",
            message_type: "error"
          },
          actions: []
        },
      });

      throw error;
    }
  },
});

// Updated agent prompt for Convex skills
export const WHITEBOARD_SKILLS_PROMPT = `
## Whiteboard Skills (Convex - Use These)

**Primary Skills:**
1. \`create_educational_content\` - Create MCQs, tables, diagrams
   - content_type: "mcq" | "table" | "diagram" 
   - data: Content-specific structure

2. \`batch_whiteboard_operations\` - Multiple drawing operations efficiently
   - operations: Array of simple add/update/clear operations

3. \`modify_whiteboard_objects\` - Update existing objects
   - updates: Array of {object_id, updates} pairs

4. \`clear_whiteboard\` - Clear content
   - scope: "all" | "selection" | "mcq" | "diagrams"

**Examples:**
{
  "skill_name": "create_educational_content",
  "skill_args": {
    "content_type": "mcq",
    "data": {
      "question": "What is 2+2?",
      "options": ["3", "4", "5", "6"],
      "correct_index": 1,
      "explanation": "2+2 equals 4"
    }
  }
}

**Legacy Skills (Auto-redirected):**
- draw_mcq, draw_mcq_actions → create_educational_content
- draw_table, draw_table_actions → create_educational_content  
- update_object_on_board → modify_whiteboard_objects
- clear_whiteboard (old) → clear_whiteboard (new)

All skills are now Convex actions with built-in timeout handling and metrics.
`;
```

## Week 3: Testing + Database Schema + Cleanup

### Day 11-12: Convex Database Schema & Testing

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  skill_metrics: defineTable({
    skill: v.string(),
    content_type: v.optional(v.string()),
    batch_id: v.string(),
    session_id: v.string(),
    elapsed_ms: v.optional(v.number()),
    error: v.optional(v.string()),
    timestamp: v.number(),
    status: v.union(v.literal("started"), v.literal("success"), v.literal("error")),
  }).index("by_session", ["session_id"])
    .index("by_skill", ["skill"])
    .index("by_batch", ["batch_id"]),

  whiteboard_actions: defineTable({
    session_id: v.string(),
    action: v.any(),
    payload: v.any(),
    batch_id: v.string(),
    timestamp: v.number(),
  }).index("by_session", ["session_id"])
    .index("by_batch", ["batch_id"]),

  batch_efficiency: defineTable({
    batch_id: v.string(),
    operations_count: v.number(),
    actions_created: v.number(),
    websocket_reduction: v.number(),
    session_id: v.string(),
    timestamp: v.number(),
  }).index("by_session", ["session_id"]),

  migration_log: defineTable({
    action: v.string(),
    details: v.string(),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
});

// Additional mutations for the new schema
// convex/metrics.ts (additional)
export const logBatchEfficiency = mutation({
  args: {
    batch_id: v.string(),
    operations_count: v.number(),
    actions_created: v.number(),
    websocket_reduction: v.number(),
    session_id: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("batch_efficiency", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

// Migration log table for tracking cleanup activities
export const logMigrationActivity = mutation({
  args: {
    action: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("migration_log", {
      action: args.action,
      details: args.details,
      timestamp: Date.now(),
    });
  },
});
```

### Day 13-14: Testing Framework for Convex Skills

```typescript
// convex/test_utils.ts - Testing utilities for Convex
import { api } from "./_generated/api";
import { ConvexTestingHelper } from "convex/testing";

export class SkillTestHelper {
  constructor(private convex: ConvexTestingHelper) {}

  async testCreateMCQSmoke() {
    const mcqData = {
      question: "What is 2+2?",
      options: ["3", "4", "5"],
      correct_index: 1
    };

    const result = await this.convex.action(api.skills.educational_content.createEducationalContent, {
      content_type: "mcq",
      data: mcqData,
      session_id: "test-session",
    });

    // Assertions
    if (!result.payload || result.payload.message_type !== "status_update") {
      throw new Error("Invalid payload structure");
    }
    
    if (!result.actions || result.actions.length !== 1) {
      throw new Error("Expected exactly one action");
    }

    if (result.actions[0].type !== "ADD_OBJECTS") {
      throw new Error("Expected ADD_OBJECTS action");
    }

    if (!result.actions[0].batch_id) {
      throw new Error("Missing batch_id");
    }

    return "MCQ smoke test passed";
  }

  async testBatchOperationsSmoke() {
    const operations = [
      {
        operation_type: "add_text" as const,
        data: { text: "Hello", x: 100, y: 50 }
      },
      {
        operation_type: "add_shape" as const,
        data: { shape_type: "circle", x: 200, y: 100 }
      }
    ];

    const result = await this.convex.action(api.skills.batch_operations.batchWhiteboardOperations, {
      operations,
      session_id: "test-session",
    });

    if (!result.payload || result.payload.message_type !== "status_update") {
      throw new Error("Invalid payload structure");
    }

    if (!result.actions || result.actions.length !== 1) {
      throw new Error("Expected batched into single action");
    }

    if (result.actions[0].type !== "ADD_OBJECTS") {
      throw new Error("Expected ADD_OBJECTS action");
    }

    if (result.actions[0].objects.length !== 2) {
      throw new Error("Expected 2 objects in batch");
    }

    return "Batch operations smoke test passed";
  }

  async testSkillCountReduction() {
    // Query skill metrics to count active skills
    const skills = await this.convex.query(api.metrics.getActiveSkillCount);
    
    if (skills.whiteboard_skills > 10) {
      throw new Error(`Too many whiteboard skills: ${skills.whiteboard_skills}`);
    }

    return `Skill count validation passed: ${skills.whiteboard_skills}/10`;
  }
}

// Performance testing
export async function testBatchVsIndividualPerformance(convex: ConvexTestingHelper) {
  const startTime = Date.now();
  
  // Test individual operations (old way simulation)
  for (let i = 0; i < 10; i++) {
    await convex.action(api.skills.educational_content.createEducationalContent, {
      content_type: "mcq",
      data: {
        question: `Q${i}`,
        options: ["A", "B"],
        correct_index: 0
      },
      session_id: "perf-test-individual",
    });
  }
  const individualTime = Date.now() - startTime;

  // Test batched operations (new way)
  const batchStartTime = Date.now();
  const operations = Array.from({ length: 10 }, (_, i) => ({
    operation_type: "add_text" as const,
    data: { text: `Question ${i}`, x: 100, y: 50 + i * 30 }
  }));

  await convex.action(api.skills.batch_operations.batchWhiteboardOperations, {
    operations,
    session_id: "perf-test-batch",
  });
  const batchTime = Date.now() - batchStartTime;

  const improvement = (individualTime - batchTime) / individualTime;
  
  if (improvement < 0.4) {
    throw new Error(`Expected >40% improvement, got ${(improvement * 100).toFixed(1)}%`);
  }

  return {
    individual_time: individualTime,
    batch_time: batchTime,
    improvement: improvement
  };
}
```

### Day 15: Migration Completion & Success Validation

```typescript
// convex/migrations/finalize_skill_migration.ts
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const validateMVPSuccess = query({
  args: {},
  handler: async (ctx) => {
    // 1. Count active whiteboard skills
    const activeSkills = [
      "create_educational_content",
      "batch_whiteboard_operations", 
      "modify_whiteboard_objects",
      "clear_whiteboard"
    ];
    
    const skillCount = activeSkills.length;
    
    // 2. Calculate P95 latency improvement
    const recentMetrics = await ctx.db
      .query("skill_metrics")
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 7 * 24 * 60 * 60 * 1000))
      .filter(q => q.eq(q.field("status"), "success"))
      .collect();
    
    const latencies = recentMetrics.map(m => m.elapsed_ms).filter(Boolean);
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const currentP95 = latencies[p95Index] || 0;
    
    const baselineP95 = 200; // ms (from before MVP)
    const improvement = (baselineP95 - currentP95) / baselineP95;
    
    // 3. Count timeout errors in last week
    const timeoutErrors = await ctx.db
      .query("skill_metrics")
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 7 * 24 * 60 * 60 * 1000))
      .filter(q => q.eq(q.field("status"), "error"))
      .filter(q => q.or(
        q.eq(q.field("error"), "timeout"),
        q.includes(q.field("error"), "timeout")
      ))
      .collect();
    
    // 4. Calculate WebSocket reduction
    const batchMetrics = await ctx.db
      .query("batch_efficiency")
      .filter(q => q.gte(q.field("timestamp"), Date.now() - 7 * 24 * 60 * 60 * 1000))
      .collect();
    
    const avgWebSocketReduction = batchMetrics.length > 0
      ? batchMetrics.reduce((sum, m) => sum + m.websocket_reduction, 0) / batchMetrics.length
      : 0;

    const success = {
      skill_count_success: skillCount <= 10,
      latency_improvement_success: improvement >= 0.4,
      timeout_errors_success: timeoutErrors.length === 0,
      websocket_reduction_success: avgWebSocketReduction >= 0.6
    };

    return {
      skills: `${skillCount}/10`,
      latency_improvement: `${(improvement * 100).toFixed(1)}%`,
      timeout_errors: timeoutErrors.length,
      websocket_reduction: `${(avgWebSocketReduction * 100).toFixed(1)}%`,
      all_success: Object.values(success).every(Boolean),
      details: success
    };
  },
});

// Cleanup deprecated Python skill references
export const cleanupLegacyReferences = mutation({
  args: {},
  handler: async (ctx) => {
    // Mark old skill calls as deprecated in logs
    await ctx.runMutation(api.metrics.logMigrationActivity, {
      action: "cleanup_legacy_references",
      details: "Cleaned up references to Python backend skills",
    });
    
    return "Legacy cleanup completed";
  },
});
```

## Rollout Plan for Convex Migration

### Phase 1: Parallel System (Week 1)
- Deploy Convex skills alongside Python skills
- Route 5% of traffic to Convex via feature flag
- Monitor performance and error rates

### Phase 2: Gradual Migration (Week 2-3)
- Increase Convex traffic to 25%, then 50%, then 75%
- Update frontend to call Convex actions instead of Python WebSocket
- Migrate agent prompts to use new skill names

### Phase 3: Full Migration (Week 3+)
- 100% traffic to Convex
- Deprecate Python skills completely
- Update all documentation

## Success Criteria Validation

```typescript
// scripts/validate_convex_migration.ts
import { ConvexHttpClient } from "convex/browser";

async function validateConvexMigration() {
  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
  
  const results = await convex.query("migrations/finalize_skill_migration:validateMVPSuccess");
  
  console.log("✅ Convex Migration Results:");
  console.log(`📊 Skills: ${results.skills}`);
  console.log(`⚡ Latency improvement: ${results.latency_improvement}`);
  console.log(`🛡️ Timeout errors: ${results.timeout_errors}`);
  console.log(`📡 WebSocket reduction: ${results.websocket_reduction}`);
  console.log(`🎯 Overall success: ${results.all_success ? "✅" : "❌"}`);
  
  if (!results.all_success) {
    console.log("❌ Failed criteria:", results.details);
    process.exit(1);
  }
  
  console.log("🎉 Convex migration MVP completed successfully!");
}

validateConvexMigration();
```

This roadmap successfully migrates the whiteboard skills from Python + Supabase to Convex while maintaining the MVP scope and achieving the performance goals. The Convex actions provide built-in timeout handling, the database schema supports comprehensive metrics, and the consolidated skills reduce complexity while improving performance.