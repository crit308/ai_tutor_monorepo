// @ts-nocheck
import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// --- NEW PRIMARY VISION TOOL ---
// 
// IMPORTANT: This tool follows OpenAI Vision API best practices:
// 1. Tool returns ONLY the file ID string (no image analysis)
// 2. Agent must embed the file ID in next assistant message using image_url content type
// 3. Vision model analyzes image AFTER it's embedded in the message
// 4. No analysis happens inside this tool - it's purely for file ID retrieval
//
export const inspectWhiteboardTool = createTool({
  name: "inspect_whiteboard",
  description: "Takes a screenshot of the whiteboard and returns a special formatted response. The system will automatically inject the image into the conversation for vision analysis.",
  args: z.object({
    sessionId: z.string().describe("The ID of the current session."),
    threadId: z.string().describe("The ID of the current thread."),
  }),
  async handler(ctx: any, args) {
    // Fetch screenshot via existing inspection action (reuse implementation)
    const inspectionResult = await ctx.runAction(internal.skills.whiteboard_inspection.inspectWhiteboard, {
      sessionId: args.sessionId as Id<"sessions">,
      userId: ctx.userId || null,
    });

    const screenshotFileId = inspectionResult.screenshotFileId || "(no screenshot)";
    
    // If we have a screenshot, analyze it immediately with vision service
    if (screenshotFileId && screenshotFileId !== "(no screenshot)" && screenshotFileId.startsWith("file-")) {
      try {
        console.log(`[inspect_whiteboard] Analyzing screenshot with vision service: ${screenshotFileId}`);
        
        // Call vision service directly to get real-time analysis
        const visionResult = await ctx.runAction(internal.agents.visionService.analyzeWhiteboardImage, {
          fileId: screenshotFileId,
          threadId: args.threadId || "temp-thread", // Provide a fallback if threadId is not available
          sessionId: args.sessionId,
          contextMessages: [], // We don't need context for immediate analysis
        });
        
        if (visionResult.success && visionResult.analysis) {
          console.log(`[inspect_whiteboard] Vision analysis successful`);
          
          // Return the actual vision analysis combined with board metadata
          return `${visionResult.analysis}

**Board Metadata:**
- Total objects: ${inspectionResult.boardSummary.objectCount}
- Board version: ${inspectionResult.boardSummary.boardVersion}
- Canvas dimensions: ${inspectionResult.boardSummary.canvasDimensions.width}x${inspectionResult.boardSummary.canvasDimensions.height}
${inspectionResult.boardSummary.warnings.length > 0 ? `- Warnings: ${inspectionResult.boardSummary.warnings.join(", ")}` : ""}`;
        } else {
          console.error(`[inspect_whiteboard] Vision analysis failed: ${visionResult.error}`);
          // Fall back to object list if vision fails
          return `I captured a screenshot but had trouble analyzing it visually. Here's what I can tell from the object data:

Board Summary:
- Total objects: ${inspectionResult.boardSummary.objectCount}
- Board version: ${inspectionResult.boardSummary.boardVersion}
- Canvas size: ${inspectionResult.boardSummary.canvasDimensions.width}x${inspectionResult.boardSummary.canvasDimensions.height}

Objects on the whiteboard:
${inspectionResult.objectList.length === 0 ? "- No objects currently on the whiteboard" : 
  inspectionResult.objectList.map(obj => 
    `- ${obj.id} (${obj.kind}): ${obj.text || "no text"} at (${obj.bbox.x}, ${obj.bbox.y})`
  ).join("\n")}`;
        }
      } catch (error) {
        console.error(`[inspect_whiteboard] Error calling vision service:`, error);
        // Fall back to object list
        return `I captured a screenshot but encountered an error analyzing it. Here's the object data:

Board Summary:
- Total objects: ${inspectionResult.boardSummary.objectCount}
- Canvas size: ${inspectionResult.boardSummary.canvasDimensions.width}x${inspectionResult.boardSummary.canvasDimensions.height}

Objects: ${inspectionResult.objectList.length === 0 ? "No objects on whiteboard" : inspectionResult.objectList.length + " objects present"}`;
      }
    } else {
      // No screenshot available, return object list
      return `No screenshot was captured. Here's the current whiteboard state:

Board Summary:
- Total objects: ${inspectionResult.boardSummary.objectCount}
- Board version: ${inspectionResult.boardSummary.boardVersion}
- Canvas size: ${inspectionResult.boardSummary.canvasDimensions.width}x${inspectionResult.boardSummary.canvasDimensions.height}

Objects on the whiteboard:
${inspectionResult.objectList.length === 0 ? "- No objects currently on the whiteboard" : 
  inspectionResult.objectList.map(obj => 
    `- ${obj.id} (${obj.kind}): ${obj.text || "no text"} at (${obj.bbox.x}, ${obj.bbox.y})`
  ).join("\n")}`;
    }
  },
});

// --- DATA-ONLY WHITEBOARD INSPECTION TOOL ---
// 
// Use this tool when you need structured data about whiteboard objects.
// If you also need to SEE the whiteboard, use inspect_whiteboard instead.
//
export const getWhiteboardDataTool = createTool({
  name: "get_whiteboard_data",
  description: "Return structured JSON data with screenshotFileId, boardSummary, and objectList for the current whiteboard. Use this when you need object data without visual analysis. For visual analysis, use inspect_whiteboard instead.",
  args: z.object({
    sessionId: z.string(),
  }),
  async handler(ctx: any, args) {
    const inspectionResult = await ctx.runAction(internal.skills.whiteboard_inspection.inspectWhiteboard, {
      sessionId: args.sessionId as Id<"sessions">,
      userId: ctx.userId || null,
    });

    return {
      screenshotFileId: inspectionResult.screenshotFileId,
      boardSummary: inspectionResult.boardSummary,
      objectList: inspectionResult.objectList,
    };
  },
});

// --- Updated WB object schema for new coordinate system ---
const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// Simplified binding schema - all properties required when binding is present
const elementBindingSchema = z.object({
  elementId: z.string(),
  focus: z.union([z.number().min(0).max(1), z.null()]),
  gap: z.union([z.number(), z.null()]),
  connectionPoint: z.union([z.enum(['auto', 'top', 'right', 'bottom', 'left', 'center']), z.null()]),
});

// Minimal base schema for all whiteboard objects - OpenAI strict mode compatible
const wbBaseSchema = z.object({
  id: z.string(),
  kind: z.string(),
  x: z.number(), // Absolute coordinates in logical space (0-2000)
  y: z.number(),
  // Remove optional properties from base schema to avoid OpenAI validation issues
  // Each specific object type will include its required properties
});

// Specific object schemas
const wbRectSchema = wbBaseSchema.extend({
  kind: z.literal('rect'),
  width: z.number(),
  height: z.number(),
  fill: z.union([z.string(), z.null()]),
  stroke: z.union([z.string(), z.null()]),
  strokeWidth: z.union([z.number(), z.null()]),
  cornerRadius: z.union([z.number(), z.null()]),
});

const wbEllipseSchema = wbBaseSchema.extend({
  kind: z.literal('ellipse'),
  width: z.number(),
  height: z.number(),
  fill: z.union([z.string(), z.null()]),
  stroke: z.union([z.string(), z.null()]),
  strokeWidth: z.union([z.number(), z.null()]),
});

const wbTextSchema = wbBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
  width: z.union([z.number(), z.null()]),
  height: z.union([z.number(), z.null()]),
  fontSize: z.union([z.number(), z.null()]),
  fontFamily: z.union([z.string(), z.null()]),
  fill: z.union([z.string(), z.null()]),
  textAlign: z.union([z.enum(['left', 'center', 'right']), z.null()]),
  baseline: z.union([z.enum(['top', 'middle', 'bottom']), z.null()]),
});

const wbLineSchema = wbBaseSchema.extend({
  kind: z.literal('line'),
  points: z.array(pointSchema).min(2), // Points relative to element position
  stroke: z.union([z.string(), z.null()]),
  strokeWidth: z.union([z.number(), z.null()]),
  startBinding: z.union([elementBindingSchema, z.null()]),
  endBinding: z.union([elementBindingSchema, z.null()]),
  markerStart: z.union([z.enum(['arrow', 'dot']), z.null()]),
  markerEnd: z.union([z.enum(['arrow', 'dot']), z.null()]),
});

const wbArrowSchema = wbBaseSchema.extend({
  kind: z.literal('arrow'),
  points: z.array(pointSchema).min(2), // Points relative to element position
  stroke: z.union([z.string(), z.null()]),
  strokeWidth: z.union([z.number(), z.null()]),
  startBinding: z.union([elementBindingSchema, z.null()]),
  endBinding: z.union([elementBindingSchema, z.null()]),
  arrowType: z.union([z.enum(['straight', 'elbow', 'curved']), z.null()]),
  controlPoints: z.union([z.array(pointSchema), z.null()]),
  curvature: z.union([z.number().min(0).max(1), z.null()]),
});

const wbPathSchema = wbBaseSchema.extend({
  kind: z.literal('path'),
  d: z.string(), // SVG path data relative to element position
  stroke: z.union([z.string(), z.null()]),
  strokeWidth: z.union([z.number(), z.null()]),
  fill: z.union([z.string(), z.null()]),
});

// Union of all object types
const wbObjectSchema = z.discriminatedUnion('kind', [
  wbRectSchema,
  wbEllipseSchema,
  wbTextSchema,
  wbLineSchema,
  wbArrowSchema,
  wbPathSchema,
]);

// NEW: Explicit diff schema for updates (strict mode compliant)
const wbDiffSchema = z
  .object({
    // Geometry & position
    x: z.union([z.number(), z.null()]),
    y: z.union([z.number(), z.null()]),
    width: z.union([z.number(), z.null()]),
    height: z.union([z.number(), z.null()]),
    // Styling
    fill: z.union([z.string(), z.null()]),
    stroke: z.union([z.string(), z.null()]),
    strokeWidth: z.union([z.number(), z.null()]),
    cornerRadius: z.union([z.number(), z.null()]),
    // Text-specific
    text: z.union([z.string(), z.null()]),
    fontSize: z.union([z.number(), z.null()]),
    fontFamily: z.union([z.string(), z.null()]),
    textAlign: z.union([z.enum(['left', 'center', 'right']), z.null()]),
    baseline: z.union([z.enum(['top', 'middle', 'bottom']), z.null()]),
    // Line/arrow specific
    points: z.union([z.array(pointSchema), z.null()]),
    controlPoints: z.union([z.array(pointSchema), z.null()]),
    markerStart: z.union([z.enum(['arrow', 'dot']), z.null()]),
    markerEnd: z.union([z.enum(['arrow', 'dot']), z.null()]),
    arrowType: z.union([z.enum(['straight', 'elbow', 'curved']), z.null()]),
    curvature: z.union([z.number().min(0).max(1), z.null()]),
    // Bindings
    startBinding: z.union([elementBindingSchema, z.null()]),
    endBinding: z.union([elementBindingSchema, z.null()]),
  })
  .strict();

// Update schema (id + diff)
const wbUpdateSchema = z.object({
  id: z.string(),
  diff: wbDiffSchema,
});

// --- SHOW WHITEBOARD IMAGE (DEPRECATED) TOOL ---
// 
// DEPRECATED: This tool is no longer needed with correct OpenAI Vision API usage.
// Use inspect_whiteboard instead, which returns the URL directly.
// The agent should embed the URL in the next assistant message automatically.
//
export const showWhiteboardImageTool = createTool({
  name: "show_whiteboard_image",
  description:
    "DEPRECATED: This tool is no longer needed. Use inspect_whiteboard instead, which returns the URL directly for embedding in assistant messages.",
  args: z.object({
    url: z.string().describe("The HTTPS URL of the whiteboard screenshot to embed."),
  }),
  async handler(_ctx, args) {
    // Simply echo back the URL so the calling framework has access if needed.
    return { url: args.url };
  },
});

// ---------------- TOOL DEFINITIONS ----------------
// Tool: create_whiteboard_objects
export const createWhiteboardObjectsTool = createTool({
  name: "create_whiteboard_objects",
  description: `Create new objects on the whiteboard using absolute coordinates in logical space (0-2000).

**Coordinate System:**
- Use absolute coordinates (x, y) in logical space: 0-2000 for both width and height
- For lines/arrows: points are relative to element position, first point should be {x:0, y:0}
- Element position (x, y) sets where the element is placed
- Example line from (100,100) to (300,200): x=100, y=100, points=[{x:0, y:0}, {x:200, y:100}]

**Object Types:**
- rect: requires width, height
- ellipse: requires width, height (diameter)
- text: requires text content
- line: requires points array (min 2 points)
- arrow: requires points array (min 2 points)

**Enhanced Arrow Features:**
- arrowType: "straight" (default), "elbow" (90-degree turns), or "curved" (smooth curves)
- curvature: 0-1 value for curved arrows (0.5 = medium curve)
- startBinding/endBinding: Connect arrows to shapes automatically
- controlPoints: Manual Bezier control points for custom curves

**Element Binding:**
- Bind arrows/lines to shapes for smart connections
- connectionPoint: "auto", "top", "right", "bottom", "left", "center"
- gap: Distance between arrow end and shape edge
- focus: 0-1 position around shape perimeter

**Examples:**
Rectangle: {id: "rect1", kind: "rect", x: 100, y: 100, width: 200, height: 100, fill: "blue"}
Straight Arrow: {id: "arrow1", kind: "arrow", x: 100, y: 100, points: [{x:0, y:0}, {x:150, y:100}], stroke: "red"}
Curved Arrow: {id: "arrow2", kind: "arrow", x: 100, y: 100, points: [{x:0, y:0}, {x:200, y:150}], arrowType: "curved", curvature: 0.3}
Bound Arrow: {id: "arrow3", kind: "arrow", x: 100, y: 100, points: [{x:0, y:0}, {x:200, y:0}], startBinding: {elementId: "rect1", focus: 0.5, gap: 10, connectionPoint: "right"}}`,
  args: z.object({
    sessionId: z.string(),
    objects: z.array(wbObjectSchema),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    // Convert object-based points to array-based points for internal schema
    const convertedObjects = args.objects.map((obj: any) => {
      let convertedObj = { ...obj, version: 1 }; // Add version field back for internal use
      
      // Provide defaults for null values
      if (convertedObj.fill === null) delete convertedObj.fill;
      if (convertedObj.stroke === null) delete convertedObj.stroke;
      if (convertedObj.strokeWidth === null) delete convertedObj.strokeWidth;
      if (convertedObj.cornerRadius === null) delete convertedObj.cornerRadius;
      if (convertedObj.fontSize === null) delete convertedObj.fontSize;
      if (convertedObj.fontFamily === null) delete convertedObj.fontFamily;
      if (convertedObj.textAlign === null) delete convertedObj.textAlign;
      if (convertedObj.baseline === null) delete convertedObj.baseline;
      if (convertedObj.markerStart === null) delete convertedObj.markerStart;
      if (convertedObj.markerEnd === null) delete convertedObj.markerEnd;
      if (convertedObj.arrowType === null) delete convertedObj.arrowType;
      if (convertedObj.controlPoints === null) delete convertedObj.controlPoints;
      if (convertedObj.curvature === null) delete convertedObj.curvature;
      if (convertedObj.width === null) delete convertedObj.width;
      if (convertedObj.height === null) delete convertedObj.height;
      
      // Handle binding schemas - provide defaults for null values
      if (convertedObj.startBinding === null) {
        delete convertedObj.startBinding;
      } else if (convertedObj.startBinding) {
        if (convertedObj.startBinding.focus === null) convertedObj.startBinding.focus = 0.5;
        if (convertedObj.startBinding.gap === null) convertedObj.startBinding.gap = 10;
        if (convertedObj.startBinding.connectionPoint === null) convertedObj.startBinding.connectionPoint = 'auto';
      }
      if (convertedObj.endBinding === null) {
        delete convertedObj.endBinding;
      } else if (convertedObj.endBinding) {
        if (convertedObj.endBinding.focus === null) convertedObj.endBinding.focus = 0.5;
        if (convertedObj.endBinding.gap === null) convertedObj.endBinding.gap = 10;
        if (convertedObj.endBinding.connectionPoint === null) convertedObj.endBinding.connectionPoint = 'auto';
      }
      
      if (obj.points && Array.isArray(obj.points)) {
        convertedObj.points = obj.points.map((point: any) => {
          if (point && typeof point === 'object' && 'x' in point && 'y' in point) {
            return [point.x, point.y];
          }
          return point; // Already in array format
        });
      }
      
      if (obj.controlPoints && Array.isArray(obj.controlPoints)) {
        convertedObj.controlPoints = obj.controlPoints.map((point: any) => {
          if (point && typeof point === 'object' && 'x' in point && 'y' in point) {
            return [point.x, point.y];
          }
          return point; // Already in array format
        });
      }
      
      return convertedObj;
    });

    const patch = { creates: convertedObjects, updates: [], deletes: [] };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: update_whiteboard_objects
export const updateWhiteboardObjectsTool = createTool({
  name: "update_whiteboard_objects",
  description: `Update existing objects on the whiteboard. You can modify position, styling, or any other properties.

**Usage:**
- Provide object ID and the properties to change
- For lines/arrows: updating points will move endpoints relative to element position
- Coordinates use logical space (0-2000)
- Points use object format: {x: number, y: number}

**Examples:**
Move object: {id: "rect1", diff: {x: 200, y: 150}}
Change color: {id: "rect1", diff: {fill: "green"}}
Resize: {id: "rect1", diff: {width: 300, height: 150}}
Update arrow points: {id: "arrow1", diff: {points: [{x:0, y:0}, {x:180, y:120}]}}`,
  args: z.object({
    sessionId: z.string(),
    updates: z.array(wbUpdateSchema),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    // Convert object-based points to array-based points for internal schema
    const convertedUpdates = args.updates.map((update: any) => {
      // Filter out null values from diff - null means "don't update this field"
      const filteredDiff = Object.fromEntries(
        Object.entries(update.diff).filter(([_, value]) => value !== null)
      );
      
      if (filteredDiff.points && Array.isArray(filteredDiff.points)) {
        return {
          ...update,
          diff: {
            ...filteredDiff,
            points: filteredDiff.points.map((point: any) => {
              if (point && typeof point === 'object' && 'x' in point && 'y' in point) {
                return [point.x, point.y];
              }
              return point; // Already in array format
            })
          }
        };
      }
      if (filteredDiff.controlPoints && Array.isArray(filteredDiff.controlPoints)) {
        return {
          ...update,
          diff: {
            ...filteredDiff,
            controlPoints: filteredDiff.controlPoints.map((point: any) => {
              if (point && typeof point === 'object' && 'x' in point && 'y' in point) {
                return [point.x, point.y];
              }
              return point; // Already in array format
            })
          }
        };
      }
      return {
        ...update,
        diff: filteredDiff
      };
    });

    const patch = { creates: [], updates: convertedUpdates, deletes: [] };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: delete_whiteboard_objects
export const deleteWhiteboardObjectsTool = createTool({
  name: "delete_whiteboard_objects",
  description: "Delete objects from the whiteboard by their IDs.",
  args: z.object({
    sessionId: z.string(),
    objectIds: z.array(z.string()),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    const patch = { creates: [], updates: [], deletes: args.objectIds };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });
    return res.payload.message_text;
  },
});

// Tool: bind_elements
export const bindElementsTool = createTool({
  name: "bind_elements",
  description: `Create smart connections between arrows/lines and shapes. This automatically connects arrow endpoints to shape edges and updates them when shapes move.

**Usage:**
- Specify the arrow/line ID and target shape ID
- Choose connection point on shape: "auto", "top", "right", "bottom", "left", "center"
- Set gap between arrow and shape edge
- Choose which end of arrow to bind: "start", "end", or "both"

**Smart Features:**
- Automatic connection point detection
- Arrows update when bound shapes move
- Supports curved arrows with automatic curvature
- Maintains visual relationships

**Examples:**
Connect arrow end to rectangle: {arrowId: "arrow1", targetId: "rect1", bindEnd: "end", connectionPoint: "left", gap: 5}
Connect both ends: {arrowId: "arrow1", startTargetId: "rect1", endTargetId: "rect2", bindEnd: "both", gap: 10}
Auto-connect with curved arrow: {arrowId: "arrow1", targetId: "rect1", bindEnd: "end", connectionPoint: "auto", gap: 8, makeCurved: true}`,
  args: z.object({
    sessionId: z.string(),
    arrowId: z.string(),
    // For single-end binding
    targetId: z.union([z.string(), z.null()]),
    bindEnd: z.enum(['start', 'end', 'both']),
    // For both-end binding
    startTargetId: z.union([z.string(), z.null()]),
    endTargetId: z.union([z.string(), z.null()]),
    // Connection options
    connectionPoint: z.enum(['auto', 'top', 'right', 'bottom', 'left', 'center']),
    gap: z.number(),
    // Arrow enhancement
    makeCurved: z.boolean(),
    curvature: z.number().min(0).max(1),
    lastKnownVersion: z.number(),
  }),
  async handler(ctx: any, args) {
    // Provide default values for properties that were previously using .default()
    const bindEnd = args.bindEnd || 'end';
    const connectionPoint = args.connectionPoint || 'auto';
    const gap = args.gap || 10;
    const makeCurved = args.makeCurved || false;
    const curvature = args.curvature || 0.3;
    
    // Get current whiteboard state
    const whiteboardState = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "get_whiteboard_state",
      skill_args: {},
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });

    const elements = whiteboardState.payload.elements || [];
    const arrow = elements.find((el: any) => el.id === args.arrowId);
    
    if (!arrow || !['arrow', 'line'].includes(arrow.kind)) {
      return `Error: Arrow/line with ID "${args.arrowId}" not found`;
    }

    const updates: any[] = [];
    let updatedArrow = { ...arrow };

    // Handle single target binding
    if (args.targetId) {
      const target = elements.find((el: any) => el.id === args.targetId);
      if (!target || !['rect', 'ellipse'].includes(target.kind)) {
        return `Error: Target shape with ID "${args.targetId}" not found`;
      }

      const binding = {
        elementId: args.targetId,
        focus: 0.5, // Will be calculated automatically
        gap: gap,
        connectionPoint: connectionPoint,
      };

      if (bindEnd === 'start' || bindEnd === 'both') {
        updatedArrow.startBinding = binding;
      }
      if (bindEnd === 'end' || bindEnd === 'both') {
        updatedArrow.endBinding = binding;
      }
    }

    // Handle both-end binding
    if (args.startTargetId && args.endTargetId) {
      const startTarget = elements.find((el: any) => el.id === args.startTargetId);
      const endTarget = elements.find((el: any) => el.id === args.endTargetId);
      
      if (!startTarget || !['rect', 'ellipse'].includes(startTarget.kind)) {
        return `Error: Start target with ID "${args.startTargetId}" not found`;
      }
      if (!endTarget || !['rect', 'ellipse'].includes(endTarget.kind)) {
        return `Error: End target with ID "${args.endTargetId}" not found`;
      }

      updatedArrow.startBinding = {
        elementId: args.startTargetId,
        focus: 0.5,
        gap: gap,
        connectionPoint: connectionPoint,
      };
      updatedArrow.endBinding = {
        elementId: args.endTargetId,
        focus: 0.5,
        gap: gap,
        connectionPoint: connectionPoint,
      };
    }

    // Make arrow curved if requested
    if (makeCurved && arrow.kind === 'arrow') {
      updatedArrow.arrowType = 'curved';
      updatedArrow.curvature = curvature;
    }

    updates.push({ id: args.arrowId, diff: updatedArrow });

    const patch = { creates: [], updates, deletes: [] };
    const res = await ctx.runAction(api.agents.whiteboard_agent.executeWhiteboardSkill, {
      skill_name: "apply_whiteboard_patch",
      skill_args: { patch, lastKnownVersion: args.lastKnownVersion },
      session_id: args.sessionId,
      user_id: ctx.userId ?? "ai-tutor",
    });

    return res.payload.message_text;
  },
});

export const whiteboardTools = {
  // --- PRIMARY VISION TOOL (OpenAI Vision API compliant) ---
  inspect_whiteboard: inspectWhiteboardTool,
  // --- DATA-ONLY TOOL (for structured data without visual analysis) ---
  get_whiteboard_data: getWhiteboardDataTool,
  // --- MODIFICATION TOOLS (UNCHANGED) ---
  create_whiteboard_objects: createWhiteboardObjectsTool,
  update_whiteboard_objects: updateWhiteboardObjectsTool,
  delete_whiteboard_objects: deleteWhiteboardObjectsTool,
  // --- DEPRECATED TOOL (no longer needed) ---
  show_whiteboard_image: showWhiteboardImageTool,
  // --- NEW TOOL (bind_elements) ---
  bind_elements: bindElementsTool,
};