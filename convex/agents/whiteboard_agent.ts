import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { internal, components } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

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

      // Migration complete - legacy logging removed

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
          result = await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
            operations: [{
              operation_type: "add_text",
              data: {
                text: args.skill_args.text || "",
                x: args.skill_args.x || 100,
                y: args.skill_args.y || 100,
                fontSize: args.skill_args.fontSize || 16,
                color: args.skill_args.color || "#000000"
              }
            }],
            session_id: args.session_id,
          });
          break;

        // Legacy Shape Drawing
        case "draw_shape":
          result = await ctx.runAction(api.skills.batch_operations.batchWhiteboardOperations, {
            operations: [{
              operation_type: "add_shape",
              data: {
                kind: args.skill_args.kind || "rect",
                x: args.skill_args.x || 100,
                y: args.skill_args.y || 100,
                width: args.skill_args.w || args.skill_args.width || 100,
                height: args.skill_args.h || args.skill_args.height || 100,
                fill: args.skill_args.color || "#000000"
              }
            }],
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
            sessionId: args.session_id as Id<"sessions">,
            patch,
            lastKnownVersion,
          });

          // No automatic follow-up scheduling. The AI tutor must explicitly call
          // get_whiteboard_summary to inspect the board and decide next steps.

          const issueText = (resultPatch.issues ?? [])
            .filter((iss: any) => iss.level === "error")
            .map((iss: any) => `Error: ${iss.message}`)
            .join("; ");
          result = {
            payload: {
              message_text:
                (issueText ? `Whiteboard issues: ${issueText}. ` : "") +
                (resultPatch.summary || "Patch applied"),
              message_type: issueText ? "error" : "status_update",
            },
            actions: [],
          };
          break;
        }

        case "inspect_whiteboard": {
          // Call the new consolidated whiteboard inspection action through internal API
          const inspectionResult = await ctx.runAction(internal.skills.whiteboard_inspection.inspectWhiteboard, {
            sessionId: args.session_id as Id<"sessions">,
          });
          
          result = {
            payload: {
              message_text: JSON.stringify(inspectionResult),
              message_type: "whiteboard_inspection",
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

// Agent prompt for simplified whiteboard skills with consolidated inspect_whiteboard tool
export const WHITEBOARD_SKILLS_PROMPT = `
## Whiteboard Skills

Your interaction with the whiteboard is a simple loop: **See, Think, Act**.

**1. See:** ALWAYS start by calling the \`inspect_whiteboard\` tool. This gives you a complete, multi-modal overview of the canvas, including a visual screenshot and a structured list of every object.

**2. Think:** Analyze the output from \`inspect_whiteboard\`. Use the screenshot for visual assessment (layout, aesthetics) and the objectList to get precise IDs, roles, and text content for modifications.

**3. Act:** Call the appropriate modification tools (\`create_whiteboard_objects\`, \`update_whiteboard_objects\`, or \`delete_whiteboard_objects\`) to make your desired changes.

**Available Tools:**
- \`inspect_whiteboard\`: Your primary tool to see and understand the whiteboard.
- \`create_whiteboard_objects\`: Add new objects.
- \`update_whiteboard_objects\`: Modify existing objects.
- \`delete_whiteboard_objects\`: Remove objects.
`;

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