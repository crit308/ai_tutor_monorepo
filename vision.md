AI Tutor Vision System Refactor
Objective: Deprecate the five existing whiteboard "getter" tools (get_whiteboard_summary, get_enhanced_whiteboard_summary, get_whiteboard_svg, get_whiteboard_image, get_whiteboard_screenshot) and replace them with a single, multi-modal tool named inspect_whiteboard.
Success Metrics:
Agent Efficiency: The agent should be able to understand the whiteboard state in a single tool call, reducing the number of turns required to complete a task.
Prompt Simplicity: The main WHITEBOARD_SKILLS_PROMPT should be significantly shorter and easier for the LLM to understand.
Reliability: The new tool should be more robust, providing comprehensive context that reduces the chance of incorrect or failed agent actions.
Maintainability: The codebase is simplified by removing redundant functions.

## Assessment Summary ✅

**Recommendation: PROCEED with the consolidation plan**

This refactor addresses real architectural problems and will significantly improve:
- Agent efficiency (single comprehensive call vs 3-5 sequential calls)
- Prompt clarity (complex 5-tool explanation → simple "See→Think→Act")
- System reliability (consistent state snapshots)
- Code maintainability (5 functions → 1 comprehensive function)

The benefits strongly outweigh the minor performance concerns. The design is well-architected with proper error handling and graceful degradation.

Phase 1: Backend - The inspect_whiteboard Action & Tool
Goal: Create the new inspectWhiteboard action and expose it as a tool to the agent framework.
Step 1: Create the Core Action
File: Create a new file: convex/skills/whiteboard_inspection.ts
Action: Define a new Convex action inspectWhiteboard. This action will orchestrate the data gathering.
Generated typescript
// convex/skills/whiteboard_inspection.ts

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Define the rich, multi-modal return type for the action
interface WhiteboardInspectionResult {
  screenshotDataUrl: string | null;
  boardSummary: {
    objectCount: number;
    boardVersion: number;
    canvasDimensions: { width: number; height: number };
    warnings: string[];
  };
  objectList: Array<{
    id: string;
    kind: string;
    role?: string;
    text?: string | null;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}

export const inspectWhiteboard = action({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.object({ /* Define a validator for WhiteboardInspectionResult */ }),
  handler: async (ctx, { sessionId }): Promise<WhiteboardInspectionResult> => {
    console.log(`[inspectWhiteboard] Starting inspection for session: ${sessionId}`);

    // 1. Get Screenshot and Object Data in Parallel
    const [screenshotResult, objects] = await Promise.all([
      ctx.runAction(api.skills.whiteboard_screenshot.requestWhiteboardScreenshot, {
        session_id: sessionId,
        request_context: "AI Agent whiteboard inspection",
      }),
      ctx.runQuery(api.database.whiteboard.getWhiteboardObjects, { sessionId }),
    ]);

    const warnings = [];
    if (!screenshotResult.success) {
      warnings.push(`Screenshot capture failed: ${screenshotResult.error_message}`);
    }

    // 2. Get Board Version from the session document
    const sessionDoc = await ctx.runQuery(api.database.sessions.getSession, { sessionId });
    const boardVersion = sessionDoc?.board_version ?? 0;
    const canvasDimensions = {
        width: sessionDoc?.context_data?.canvasDimensions?.width ?? 1200,
        height: sessionDoc?.context_data?.canvasDimensions?.height ?? 800
    };

    // 3. Process Objects into a clean list
    const objectList = objects.map(obj => ({
      id: obj.id,
      kind: obj.kind,
      role: obj.metadata?.role,
      text: obj.text || null,
      bbox: {
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      },
    }));

    // 4. Assemble the final payload
    const result: WhiteboardInspectionResult = {
      screenshotDataUrl: screenshotResult.image_data || null,
      boardSummary: {
        objectCount: objects.length,
        boardVersion: boardVersion,
        canvasDimensions,
        warnings: warnings,
      },
      objectList: objectList,
    };

    return result as any; // Cast as any to bypass strict return validation for now
  },
});
Use code with caution.
TypeScript
Step 2: Create the Agent Tool
File: Modify convex/agents/whiteboard_tools.ts.
Action: Define a new tool that wraps the action from Step 1.
Generated typescript
// convex/agents/whiteboard_tools.ts
import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api } from "../_generated/api";

// ... (keep existing create/update/delete tools)

export const inspectWhiteboardTool = createTool({
  name: "inspect_whiteboard",
  description: "Get a comprehensive overview of the current whiteboard. Returns a visual screenshot and a structured list of all objects, their properties, and text content. Use this as your primary way to 'see' the board before making any changes.",
  args: z.object({
    sessionId: z.string().describe("The ID of the current session."),
  }),
  async handler(ctx: any, args) {
    // Call the new action
    const inspectionResult = await ctx.runAction(api.skills.whiteboard_inspection.inspectWhiteboard, {
      sessionId: args.sessionId,
    });

    // Return the result as a stringified JSON for the agent to parse
    return JSON.stringify(inspectionResult);
  },
});
Use code with caution.
TypeScript
Phase 2: Agent Integration & Prompt Simplification
Goal: Teach the AI agent to use the new inspect_whiteboard tool and stop using the old ones.
Step 1: Update the Tool Registry
File: Modify convex/agents/whiteboard_tools.ts.
Action: Update the whiteboardTools export to include the new tool and comment out the old ones.
Generated typescript
// convex/agents/whiteboard_tools.ts

export const whiteboardTools = {
  // --- NEW PRIMARY VISION TOOL ---
  inspect_whiteboard: inspectWhiteboardTool,

  // --- DEPRECATED VISION TOOLS ---
  // get_whiteboard_summary: getWhiteboardSummaryTool,
  // get_enhanced_whiteboard_summary: getEnhancedWhiteboardSummaryTool,
  // get_whiteboard_svg: getWhiteboardSVGTool,
  // get_whiteboard_image: getWhiteboardImageTool,
  // get_whiteboard_screenshot: getWhiteboardScreenshotTool,

  // --- MODIFICATION TOOLS (UNCHANGED) ---
  create_whiteboard_objects: createWhiteboardObjectsTool,
  update_whiteboard_objects: updateWhiteboardObjectsTool,
  delete_whiteboard_objects: deleteWhiteboardObjectsTool,
};
Use code with caution.
TypeScript
Step 2: Refactor the System Prompt
File: Modify convex/agents/whiteboard_agent.ts.
Action: Replace the complex WHITEBOARD_SKILLS_PROMPT with a simpler, more direct version.
BEFORE (Current Prompt):
Generated typescript
// A long prompt explaining 5 different "get" tools...
export const WHITEBOARD_SKILLS_PROMPT = `
## Whiteboard Skills – Primitives-First Patch API (2024-V2)

Your interaction with the whiteboard happens in **three** steps:

1. **See** – call \`get_whiteboard_summary\` for a basic overview, \`get_enhanced_whiteboard_summary\` for detailed spatial analysis, \`get_whiteboard_svg\` for complete structure as text, \`get_whiteboard_image\` to actually SEE the whiteboard visually as an image.
...
`;
Use code with caution.
TypeScript
AFTER (New, Simplified Prompt):
Generated typescript
// convex/agents/whiteboard_agent.ts

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
Use code with caution.
TypeScript
Phase 3: Deprecation and Code Cleanup
Goal: Safely remove the five old "getter" tools and their underlying actions/queries once they are no longer in use.
Monitor (1-2 days after deployment):
Deploy the changes from Phase 1 and 2.
Observe the Convex function logs for the production deployment.
Search for any invocations of the old tools: get_whiteboard_summary, get_enhanced_whiteboard_summary, get_whiteboard_svg, get_whiteboard_image, get_whiteboard_screenshot.
If any are found, the prompt in Phase 2 needs further refinement. If none are found, proceed.
Delete Deprecated Code:
In convex/agents/whiteboard_tools.ts:
Delete the tool definitions for the five old "get" tools.
Update the whiteboardTools export to completely remove them.
In convex/skills/whiteboard_query.ts:
Delete the query functions: getWhiteboardSummary, getEnhancedWhiteboardSummary, getWhiteboardAsSVG, getWhiteboardAsImage.
In convex/skills/whiteboard_screenshot.ts:
The core requestWhiteboardScreenshot action is still needed by our new tool, so keep it. You can mark the getWhiteboardScreenshot export as deprecated or remove it if it's no longer called directly.