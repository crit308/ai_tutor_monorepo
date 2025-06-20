/*
 * @package      whiteboard-schema
 * @description  Canonical type definitions for whiteboard primitives and actions.  
 *                Imported by both Convex backend and React frontend to guarantee a single
 *                source-of-truth.
 */

// ---------------------------------------------------------------------------
// Primitive object definitions
// ---------------------------------------------------------------------------
export interface WBBase {
  id: string;                    // Unique per object in a session (UUID or batch-scoped id)
  metadata?: Record<string, any>; // Must include groupId; helpers may add generator & version
}

export interface WBRect extends WBBase {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface WBEllipse extends WBBase {
  kind: "ellipse";
  x: number;
  y: number;
  rx: number;
  ry: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface WBText extends WBBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fill?: string;
  textAnchor?: "start" | "middle" | "end";
}

export interface WBLine extends WBBase {
  kind: "line";
  points: number[];   // [x1, y1, x2, y2, ...]
  stroke?: string;
  strokeWidth?: number;
  markerEnd?: "arrow";
}

export interface WBPath extends WBBase {
  kind: "path";
  d: string;          // SVG path data
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}

export type WBObject = WBRect | WBEllipse | WBText | WBLine | WBPath;

// ---------------------------------------------------------------------------
// Whiteboard actions (low-level ops streamed to the UI)
// ---------------------------------------------------------------------------
export type WhiteboardAction =
  | { type: "ADD_OBJECTS"; objects: WBObject[] }
  | { type: "UPDATE_OBJECTS"; objects: Partial<WBObject & { id: string }>[] }
  | { type: "DELETE_OBJECTS"; ids: string[] }
  | { type: "CLEAR_CANVAS"; scope?: "all" | "assistant_only" | "visual_only" };

// ---------------------------------------------------------------------------
// Type guards (handy in runtime code)
// ---------------------------------------------------------------------------
export function isWBRect(o: WBObject): o is WBRect {
  return o.kind === "rect";
}
export function isWBEllipse(o: WBObject): o is WBEllipse {
  return o.kind === "ellipse";
}
export function isWBText(o: WBObject): o is WBText {
  return o.kind === "text";
}
export function isWBLine(o: WBObject): o is WBLine {
  return o.kind === "line";
}
export function isWBPath(o: WBObject): o is WBPath {
  return o.kind === "path";
}

// ---------------------------------------------------------------------------
// Compatibility: legacy CanvasObjectSpec superset (frontend code)
// ---------------------------------------------------------------------------
export interface CanvasObjectSpec {
  id: string;
  kind: string; // accepts any kind; runtime validation filters to primitives
  x?: number | string;
  y?: number | string;
  xPct?: number;
  yPct?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  width?: number | string;
  height?: number | string;
  widthPct?: number;
  heightPct?: number;
  radius?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  points?: number[] | { x: number; y: number }[] | string;
  angle?: number;
  selectable?: boolean;
  evented?: boolean;
  src?: string;
  objects?: CanvasObjectSpec[];
  size?: number;
  metadata?: {
    id: string;
    source?: string;
    groupId?: string;
    pctCoords?: { xPct?: number; yPct?: number; widthPct?: number; heightPct?: number };
    latex?: string;
    layoutSpec?: any;
    [key: string]: any;
  };
  groupId?: string;
  options?: string[];
}

// Re-export for convenience
export type { CanvasObjectSpec as WBObjectCompat };

// ---------------------------------------------------------------------------
// Patch contract & validation
// ---------------------------------------------------------------------------
/**
 * A minimal semantic change-set to the whiteboard. The Convex mutation processes
 * these three arrays in the order: deletes → updates → creates.
 */
export interface WhiteboardPatch {
  creates?: WBObject[];
  updates?: { id: string; diff: Partial<WBObject> }[];
  deletes?: string[];
}

export interface ValidationIssue {
  level: "warning" | "error";
  message: string;
  objectId?: string;
}