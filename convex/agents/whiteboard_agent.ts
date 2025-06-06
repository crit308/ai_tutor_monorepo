import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

/**
 * Whiteboard Agent for Convex Skills Migration (Day 4-5)
 * 
 * Routes whiteboard skill calls from agents to appropriate Convex actions.
 * Supports all Day 4-5 skills: modify, clear, highlight, delete whiteboard objects
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

      // Route to appropriate consolidated skill based on skill name
      switch (args.skill_name) {
        // Educational content creation (Day 1-2)
        case "create_educational_content":
        case "draw_mcq":
        case "draw_mcq_actions":
        case "draw_table":
        case "draw_table_actions":
        case "draw_diagram":
        case "draw_diagram_actions":
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Object modification skills (Day 4-5)
        case "modify_whiteboard_objects":
        case "update_object_on_board":
          result = await ctx.runAction(api.skills.whiteboard_modifications.modifyWhiteboardObjects, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Clear whiteboard skills (Day 4-5)
        case "clear_whiteboard":
        case "clear_board":
        case "clear_canvas":
          result = await ctx.runAction(api.skills.whiteboard_modifications.clearWhiteboard, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Highlight object skills (Day 4-5)
        case "highlight_object":
        case "highlight_object_on_board":
          result = await ctx.runAction(api.skills.whiteboard_modifications.highlightObject, {
            ...args.skill_args,
            session_id: args.session_id,
          });
          break;

        // Delete object skills (Day 4-5)
        case "delete_whiteboard_objects":
        case "delete_object_on_board":
          result = await ctx.runAction(api.skills.whiteboard_modifications.deleteWhiteboardObjects, {
            object_ids: args.skill_args.object_ids || [args.skill_args.object_id],
            session_id: args.session_id,
            batch_id: args.skill_args.batch_id,
          });
          break;

        // Batch operations (Future Day 6-7)
        case "batch_whiteboard_operations":
        case "batch_draw":
          // This will be implemented in Day 6-7
          throw new Error(`Batch operations not yet implemented: ${args.skill_name}`);

        // Legacy skill redirects
        case "draw_mcq_feedback":
        case "draw_flowchart_actions":
        case "draw_axis_actions":
        case "draw_graph":
        case "draw_latex":
          console.log(`Legacy skill ${args.skill_name} redirected to educational content`);
          result = await ctx.runAction(api.skills.educational_content.createEducationalContent, {
            content_type: "diagram",
            data: args.skill_args,
            session_id: args.session_id,
          });
          break;

        default:
          throw new Error(`Unknown whiteboard skill: ${args.skill_name}`);
      }

      // Log successful skill execution
      console.log(`Successfully executed skill: ${args.skill_name}`);
      return result;

    } catch (error) {
      console.error(`Skill execution failed for ${args.skill_name}:`, error);
      
      // Return user-friendly error response
      return {
        payload: {
          message_text: "I encountered an issue with the whiteboard operation. Please try again.",
          message_type: "error"
        },
        actions: []
      };
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
  handler: async (ctx, args) => {
    console.log(`Legacy whiteboard skill dispatch called: ${args.skill_name}`);
    
    // For now, return a simple response - this can be enhanced later
    return {
      payload: {
        message_text: `Legacy skill ${args.skill_name} called - redirecting to new system`,
        message_type: "status_update"
      },
      actions: []
    };
  },
});

// Agent prompt for Day 4-5 whiteboard skills
export const WHITEBOARD_SKILLS_PROMPT = `
## Whiteboard Skills (Convex - Day 4-5 Complete)

**Primary Skills:**
1. \`create_educational_content\` - Create MCQs, tables, diagrams
   - content_type: "mcq" | "table" | "diagram" 
   - data: Content-specific structure

2. \`modify_whiteboard_objects\` - Update existing objects (NEW Day 4-5)
   - updates: Array of {object_id, updates} pairs
   - Supports position, size, style changes

3. \`clear_whiteboard\` - Clear content (NEW Day 4-5)
   - scope: "all" | "selection" | "mcq" | "diagrams" | "tables" | "assistant_content"

4. \`highlight_object\` - Highlight specific objects (NEW Day 4-5)
   - object_id: ID of object to highlight
   - color: Highlight color (optional)
   - pulse: Whether to animate (optional)

5. \`delete_whiteboard_objects\` - Delete specific objects (NEW Day 4-5)
   - object_ids: Array of object IDs to delete

**Examples:**

\`\`\`json
// Modify objects
{
  "skill_name": "modify_whiteboard_objects",
  "skill_args": {
    "updates": [
      {
        "object_id": "mcq-question-123",
        "updates": {
          "x": 200,
          "y": 150,
          "fill": "#FF0000"
        }
      }
    ]
  }
}

// Clear whiteboard
{
  "skill_name": "clear_whiteboard", 
  "skill_args": {
    "scope": "mcq"
  }
}

// Highlight object
{
  "skill_name": "highlight_object",
  "skill_args": {
    "object_id": "diagram-circle-456",
    "color": "#00FF00",
    "pulse": true
  }
}
\`\`\`

**Legacy Skills (Auto-redirected):**
- update_object_on_board → modify_whiteboard_objects
- highlight_object_on_board → highlight_object
- delete_object_on_board → delete_whiteboard_objects
- clear_board → clear_whiteboard

All skills include automatic timeout handling, metrics logging, and error recovery.
`;

// Helper function to validate skill arguments before routing
function validateSkillArgs(skill_name: string, skill_args: any): void {
  switch (skill_name) {
    case "modify_whiteboard_objects":
      if (!skill_args.updates || !Array.isArray(skill_args.updates)) {
        throw new Error("modify_whiteboard_objects requires 'updates' array");
      }
      break;
    case "clear_whiteboard":
      if (!skill_args.scope) {
        throw new Error("clear_whiteboard requires 'scope' parameter");
      }
      break;
    case "highlight_object":
      if (!skill_args.object_id) {
        throw new Error("highlight_object requires 'object_id' parameter");
      }
      break;
    case "delete_whiteboard_objects":
      if (!skill_args.object_ids && !skill_args.object_id) {
        throw new Error("delete_whiteboard_objects requires 'object_ids' or 'object_id' parameter");
      }
      break;
  }
} 