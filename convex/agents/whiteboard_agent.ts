import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

/**
 * Whiteboard Agent for Convex Skills Migration (Day 8-9 Complete)
 * 
 * Routes whiteboard skill calls from agents to appropriate Convex actions.
 * Supports all legacy Python skills via migration bridge and new Convex skills.
 */
export const executeWhiteboardSkill = action({
  args: {
    skill_name: v.string(),
    skill_args: v.any(),
    session_id: v.string(),
    user_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    const start_time = Date.now();
    
    try {
      let result: {payload: {message_text: string, message_type: string}, actions: any[]};

      // Log the skill call for migration tracking and metrics
      await ctx.runMutation(api.metrics.logSkillCall, {
        skill: args.skill_name,
        batch_id: "agent-call",
        session_id: args.session_id,
      });

      await ctx.runAction(api.legacy.migration_bridge.logMigrationCall, {
        legacy_skill: args.skill_name,
        new_skill: "unknown", // Will be updated below
        session_id: args.session_id,
      });

      // Route to appropriate consolidated skill based on skill name
      switch (args.skill_name) {
        // ===== EDUCATIONAL CONTENT SKILLS (Day 1-2) =====
        case "create_educational_content":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // MCQ Skills - Legacy and New
        case "draw_mcq":
        case "draw_mcq_actions":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "mcq",
            data: args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Table Skills - Legacy and New
        case "draw_table":
        case "draw_table_actions":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "table",
            data: args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Diagram Skills - Legacy and New
        case "draw_diagram":
        case "draw_diagram_actions":
        case "draw_flowchart":
        case "draw_flowchart_actions":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "diagram",
            data: args.skill_args,
            session_id: args.session_id,
          });
          break;

        // ===== BATCH OPERATIONS SKILLS (Day 6-7) =====
        case "batch_whiteboard_operations":
        case "batch_draw":
        case "draw": // Legacy drawing tools
          result = await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // ===== WHITEBOARD MODIFICATION SKILLS (Day 4-5) =====
        case "modify_whiteboard_objects":
        case "update_object_on_board":
          result = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        case "clear_whiteboard":
        case "clear_board":
        case "clear_canvas":
          result = await ctx.runAction(api.skills.whiteboard_modifications.clearWhiteboard, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        case "highlight_object":
        case "highlight_object_on_board":
        case "show_pointer_at": // Legacy pointer skill
          result = await ctx.runAction(api.skills.whiteboard_modifications.highlightObject, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        case "delete_whiteboard_objects":
        case "delete_object_on_board":
          result = await ctx.runAction(api.skills.whiteboard_modifications.deleteWhiteboardObjects, {
            object_ids: args.skill_args.object_ids || [args.skill_args.object_id],
            session_id: args.session_id,
            batch_id: args.skill_args.batch_id,
          });
          break;

        // ===== LEGACY PYTHON SKILLS BRIDGE (Day 8-9) =====
        
        // MCQ Feedback
        case "draw_mcq_feedback":
          // For now, redirect to a simple update operation - can be enhanced later
          result = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            updates: [{
              object_id: `mcq-${args.skill_args.question_id || "q1"}-opt-${args.skill_args.option_id || 0}-radio`,
              updates: {
                fill: args.skill_args.is_correct ? "#2ECC71" : "#E74C3C",
                stroke: args.skill_args.is_correct ? "#2ECC71" : "#E74C3C"
              }
            }],
            session_id: args.session_id,
          });
          break;

        // Legacy Text Drawing
        case "draw_text":
          result = await ctx.runAction(api.legacy.migration_bridge.legacyDrawText, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Legacy Shape Drawing
        case "draw_shape":
          result = await ctx.runAction(api.legacy.migration_bridge.legacyDrawShape, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Legacy Axis and Graph Skills
        case "draw_axis":
        case "draw_axis_actions":
        case "draw_graph":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "diagram",
            data: {
              diagram_type: "axis",
              title: args.skill_args.label_x && args.skill_args.label_y 
                ? `${args.skill_args.label_x} vs ${args.skill_args.label_y}` 
                : "Coordinate Axis",
              elements: []
            },
            session_id: args.session_id,
          });
          break;

        // Legacy LaTeX Skill
        case "draw_latex":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "diagram",
            data: {
              diagram_type: "latex",
              title: "Mathematical Formula",
              elements: [{ text: args.skill_args.latex || args.skill_args.formula }]
            },
            session_id: args.session_id,
          });
          break;

        // Legacy Grouping Skills
        case "group_objects":
        case "move_group":
        case "delete_group":
          result = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            updates: args.skill_args.object_ids?.map((id: string) => ({
              object_id: id,
              updates: args.skill_args.updates || {}
            })) || [],
            session_id: args.session_id,
          });
          break;

        // Legacy Layout Operations
        case "add_objects_to_board":
          result = await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
            operations: (args.skill_args.objects || []).map((obj: any) => ({
              operation_type: obj.kind === "text" ? "add_text" : "add_shape",
              data: obj
            })),
            session_id: args.session_id,
          });
          break;

        case "find_object_on_board":
          const found = await ctx.runQuery(api.database.whiteboard.findObjectOnBoard, {
            sessionId: args.session_id as any,
            metaQuery: args.skill_args.meta_query || undefined,
            spatialQuery: args.skill_args.spatial_query || undefined,
            fields: args.skill_args.fields || undefined,
          });
          result = {
            payload: {
              message_text: `Found ${found.length} object(s) matching criteria`,
              message_type: "status_update",
            },
            actions: [],
          };
          break;

        // Legacy Explanation Skills
        case "explain_diagram_part":
          result = {
            payload: {
              message_text: `Explaining diagram part: ${args.skill_args.part_id || "selected element"}`,
              message_type: "status_update"
            },
            actions: []
          };
          break;

        // Style Token (Legacy)
        case "style_token":
          result = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            updates: [{
              object_id: args.skill_args.object_id,
              updates: args.skill_args.style || {}
            }],
            session_id: args.session_id,
          });
          break;

        // ===== PATCH-BASED WHITEBOARD V2 (Primitives-First) =====
        case "apply_whiteboard_patch":
        case "applyWhiteboardPatch": {
          const { patch, lastKnownVersion } = args.skill_args ?? {};
          const resultPatch = await ctx.runMutation(api.database.whiteboard.applyWhiteboardPatch, {
            sessionId: args.session_id,
            patch,
            lastKnownVersion,
          });
          result = {
            payload: {
              message_text: resultPatch.summary || "Patch applied",
              message_type: "status_update",
            },
            actions: [],
          };
          break;
        }

        case "get_whiteboard_summary": {
          const summary: string = await ctx.runQuery(api.skills.whiteboard_query.getWhiteboardSummary, {
            sessionId: args.session_id,
          });
          result = {
            payload: {
              message_text: summary,
              message_type: "whiteboard_summary",
            },
            actions: [],
          };
          break;
        }

        // ===== UNKNOWN SKILLS =====
        default:
          console.warn(`Unknown whiteboard skill: ${args.skill_name}`);
          
          // Try to handle it as a legacy redirect
          if (args.skill_name.includes("draw_") || args.skill_name.includes("_actions")) {
            console.log(`Attempting legacy redirect for: ${args.skill_name}`);
            result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
              content_type: "diagram",
              data: args.skill_args,
              session_id: args.session_id,
            });
          } else {
            throw new Error(`Unknown whiteboard skill: ${args.skill_name}`);
          }
          break;
      }

      // Log successful skill execution
      const elapsed_ms = Date.now() - start_time;
      console.log(`Successfully executed skill: ${args.skill_name} in ${elapsed_ms}ms`);
      
      // Log success metrics
      await ctx.runMutation(api.metrics.logSkillSuccess, {
        skill: args.skill_name,
        elapsed_ms,
        batch_id: "agent-call",
        session_id: args.session_id,
      });

      // Send result to frontend via WebSocket
      await ctx.runMutation(api.websockets.sendToSession, {
        session_id: args.session_id,
        data: result,
      });
      
      return result;

    } catch (error) {
      const elapsed_ms = Date.now() - start_time;
      console.error(`Skill execution failed for ${args.skill_name} after ${elapsed_ms}ms:`, error);
      
      // Log the error for metrics
      await ctx.runMutation(api.metrics.logSkillError, {
        skill: args.skill_name,
        elapsed_ms,
        error: (error as Error).message,
        batch_id: "agent-error",
        session_id: args.session_id,
      });
      
      // Send error to frontend via WebSocket
      const errorResponse = {
        payload: {
          message_text: "I encountered an issue with the whiteboard operation. Please try again.",
          message_type: "error"
        },
        actions: []
      };

      await ctx.runMutation(api.websockets.sendToSession, {
        session_id: args.session_id,
        data: errorResponse,
      });
      
      // Return user-friendly error response
      return errorResponse;
    }
  },
});

// Legacy compatibility action for older agent integrations
export const legacyWhiteboardSkillDispatch = action({
  args: {
    skill_name: v.string(),
    skill_args: v.any(),
    session_id: v.string(),
  },
  returns: v.object({
    payload: v.object({
      message_text: v.string(),
      message_type: v.string(),
    }),
    actions: v.array(v.any()),
  }),
  handler: async (ctx, args): Promise<{payload: {message_text: string, message_type: string}, actions: any[]}> => {
    console.log(`Legacy whiteboard skill dispatch called: ${args.skill_name}`);
    
    // Route through the main agent
    return await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: args.skill_name,
      skill_args: args.skill_args,
      session_id: args.session_id,
      user_id: "legacy-dispatch"
    });
  },
});

// Agent prompt for Day 10 complete whiteboard skills with WebSocket integration
export const WHITEBOARD_SKILLS_PROMPT = `
## Whiteboard Skills – Primitives-First Patch API (2024-V2)

Your interaction with the whiteboard happens in **three** steps:

1. **See** – call \`get_whiteboard_summary\` to obtain a concise, text-only description of the current board. If you need details about specific objects, call \`findObjectOnBoard\` with metadata filters.

2. **Think** – decide what changes are necessary. Compose a **single JSON patch** describing ONLY the semantic primitives you want to create, update, or delete. The shape of the patch:

\`\`\`json
{
  "creates": [ WBObject, … ],
  "updates": [ { "id": "obj-123", "diff": <partial WBObject> } ],
  "deletes": [ "obj-999" ]
}
\`\`\`

3. **Act** – call \`apply_whiteboard_patch\` with the patch. The Convex backend will validate and return:

\`\`\`json
{
  "success": true,
  "newBoardVersion": 42,
  "issues": [ { "level": "warning", "message": "…" } ],
  "summary": "Created 2, updated 1."
}
\`\`\`

• After each patch, INSPECT the \`issues\` array. If any \`error\` level issues appear, immediately send a follow-up corrective patch instead of redrawing the whole board.

• Prefer minimal diffs — move or edit objects instead of deleting & recreating unless necessary.

• IDs are UUIDs (client-generated). Always include a meaningful \`groupId\` in metadata for related objects.

Available skill signatures:

1. \`get_whiteboard_summary\`  
   Request:
   \`\`\`json
   { "sessionId": "sess_…" }
   \`\`\`
   Response: *string* summary.

2. \`findObjectOnBoard\`  
   Request:
   \`\`\`json
   { "metaQuery": { "role": "title" } }
   \`\`\`
   Returns array of objects matching metadata / spatial criteria.

3. \`apply_whiteboard_patch\`  
   Request:
   \`\`\`json
   {
     "patch": <WhiteboardPatch>,
     "lastKnownVersion": 41
   }
   \`\`\`
   Response: see above.

You no longer need the old skills (batch_whiteboard_operations, modify_whiteboard_objects, etc.). Always use the patch flow instead.`;

// Validation helper for skill arguments
function validateSkillArgs(skill_name: string, skill_args: any): void {
  if (!skill_args) {
    throw new Error(`Missing skill_args for ${skill_name}`);
  }
  
  // Add specific validations based on skill type
  switch (skill_name) {
    case "create_educational_content":
      if (!skill_args.content_type) {
        throw new Error("content_type required for create_educational_content");
      }
      break;
    case "batch_whiteboard_operations":
      if (!skill_args.operations || !Array.isArray(skill_args.operations)) {
        throw new Error("operations array required for batch_whiteboard_operations");
      }
      break;
    case "modify_whiteboard_objects":
      if (!skill_args.updates || !Array.isArray(skill_args.updates)) {
        throw new Error("updates array required for modify_whiteboard_objects");
      }
      break;
  }
} 