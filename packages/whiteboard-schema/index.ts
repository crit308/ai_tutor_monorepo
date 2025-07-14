/*
 * @package      whiteboard-schema
 * @description  Canonical type definitions for whiteboard primitives and actions.  
 *                Imported by both Convex backend and React frontend to guarantee a single
 *                source-of-truth.
 */

// ---------------------------------------------------------------------------
// Core coordinate and viewport system
// ---------------------------------------------------------------------------

/** Point represented as [x, y] tuple relative to element origin */
export type Point = readonly [number, number];

/** Viewport manages zoom and pan state */
export interface Viewport {
  zoom: number;      // 1.0 = 100%
  scrollX: number;   // Pan offset X
  scrollY: number;   // Pan offset Y
}

/** Logical coordinate space (resolution-independent) */
export const LOGICAL_SPACE = {
  width: 2000,
  height: 2000
} as const;

// ---------------------------------------------------------------------------
// Primitive object definitions (Excalidraw-inspired)
// ---------------------------------------------------------------------------

export interface WBBase {
  id: string;                    // Unique per object in a session (UUID or batch-scoped id)
  x: number;                     // Element origin X in logical space
  y: number;                     // Element origin Y in logical space
  width?: number;                // Element width in logical space
  height?: number;               // Element height in logical space
  angle?: number;                // Rotation angle in radians
  version: number;               // Version for caching and change detection
  metadata?: {
    groupId?: string;            // Group membership
    source?: 'ai' | 'user';     // Creation source
    generator?: string;          // Tool that created this (e.g., "flowchart")
    generatorVersion?: string;   // Tool version
    binding?: ElementBinding;    // Connection to other elements
    [key: string]: any;
  };
}

/** Element binding for connecting linear elements to other elements */
export interface ElementBinding {
  elementId: string;             // ID of bound element
  focus: number;                 // 0-1 position on element perimeter
  gap: number;                   // Distance between elements
  // Enhanced binding features
  connectionPoint?: "auto" | "top" | "right" | "bottom" | "left" | "center";
  snapToGrid?: boolean;          // Whether to snap connection to grid
  fixedEndpoint?: Point;         // Fixed endpoint coordinates (overrides focus)
}

export interface WBRect extends WBBase {
  kind: "rect";
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
}

export interface WBEllipse extends WBBase {
  kind: "ellipse";
  width: number;                 // Diameter width
  height: number;                // Diameter height  
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface WBText extends WBBase {
  kind: "text";
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  textAlign?: "left" | "center" | "right";
  baseline?: "top" | "middle" | "bottom";
}

export interface WBLine extends WBBase {
  kind: "line";
  points: Point[];               // Points relative to (x,y), first point is [0,0]
  stroke?: string;
  strokeWidth?: number;
  startBinding?: ElementBinding; // Connection at start point
  endBinding?: ElementBinding;   // Connection at end point
  markerStart?: "arrow" | "dot" | null;
  markerEnd?: "arrow" | "dot" | null;
}

export interface WBPath extends WBBase {
  kind: "path";
  d: string;                     // SVG path data relative to (x,y)
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}

export interface WBArrow extends WBBase {
  kind: "arrow";
  points: Point[];               // Points relative to (x,y), first point is [0,0]
  stroke?: string;
  strokeWidth?: number;
  startBinding?: ElementBinding; // Connection at start point
  endBinding?: ElementBinding;   // Connection at end point
  arrowType?: "straight" | "elbow" | "curved";
  // Enhanced curved arrow support
  controlPoints?: Point[];       // Bezier control points for curved arrows
  curvature?: number;           // 0-1 value for automatic curve generation
}

export type WBObject = WBRect | WBEllipse | WBText | WBLine | WBPath | WBArrow;

// ---------------------------------------------------------------------------
// Whiteboard actions (low-level ops streamed to the UI)
// ---------------------------------------------------------------------------
export type WhiteboardAction =
  | { type: "ADD_OBJECTS"; objects: WBObject[]; batchId?: string }
  | { type: "UPDATE_OBJECTS"; objects: Partial<WBObject & { id: string }>[]; batchId?: string }
  | { type: "DELETE_OBJECTS"; ids: string[]; batchId?: string }
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
export function isWBArrow(o: WBObject): o is WBArrow {
  return o.kind === "arrow";
}

/** Check if element supports binding (can be connected to) */
export function isBindableElement(element: WBObject): element is WBRect | WBEllipse {
  return element.kind === "rect" || element.kind === "ellipse";
}

/** Check if element is linear (can connect to other elements) */
export function isLinearElement(element: WBObject): element is WBLine | WBArrow {
  return element.kind === "line" || element.kind === "arrow";
}

// ---------------------------------------------------------------------------
// Coordinate transformation utilities
// ---------------------------------------------------------------------------

/** Convert logical coordinates to screen coordinates */
export function logicalToScreen(
  logicalX: number, 
  logicalY: number, 
  viewport: Viewport, 
  canvasWidth: number, 
  canvasHeight: number
): Point {
  const scaleX = canvasWidth / LOGICAL_SPACE.width;
  const scaleY = canvasHeight / LOGICAL_SPACE.height;
  
  return [
    (logicalX * scaleX - viewport.scrollX) * viewport.zoom,
    (logicalY * scaleY - viewport.scrollY) * viewport.zoom
  ];
}

/** Convert screen coordinates to logical coordinates */
export function screenToLogical(
  screenX: number, 
  screenY: number, 
  viewport: Viewport, 
  canvasWidth: number, 
  canvasHeight: number
): Point {
  const scaleX = canvasWidth / LOGICAL_SPACE.width;
  const scaleY = canvasHeight / LOGICAL_SPACE.height;
  
  return [
    (screenX / viewport.zoom + viewport.scrollX) / scaleX,
    (screenY / viewport.zoom + viewport.scrollY) / scaleY
  ];
}

/** Normalize points so first point is at [0,0] relative to element origin */
export function normalizePoints(points: Point[]): { points: Point[], offsetX: number, offsetY: number } {
  if (points.length === 0) {
    return { points: [], offsetX: 0, offsetY: 0 };
  }
  
  const [firstX, firstY] = points[0];
  const normalizedPoints: Point[] = points.map(([x, y]) => [x - firstX, y - firstY]);
  
  return {
    points: normalizedPoints,
    offsetX: firstX,
    offsetY: firstY
  };
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
  rxPct?: number; // X radius as percentage of canvas width for ellipses
  ryPct?: number; // Y radius as percentage of canvas height for ellipses
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
  version?: number; // Add version support to legacy spec
  metadata?: {
    id: string;
    source?: string;
    groupId?: string;
    pctCoords?: { xPct?: number; yPct?: number; widthPct?: number; heightPct?: number };
    latex?: string;
    layoutSpec?: any;
    binding?: ElementBinding;
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

// ---------------------------------------------------------------------------
// Element creation helpers
// ---------------------------------------------------------------------------

/** Create a new WBObject with proper version and metadata defaults */
export function createWBElement<T extends WBObject>(
  element: Omit<T, 'version' | 'metadata'> & { metadata?: Partial<T['metadata']> }
): T {
  return {
    ...element,
    version: 1,
    metadata: {
      groupId: element.id,
      source: 'ai',
      ...element.metadata
    }
  } as T;
}

/** Increment element version for change tracking */
export function updateElementVersion<T extends WBObject>(element: T): T {
  return {
    ...element,
    version: element.version + 1,
  };
}

// Enhanced utility functions for binding and curved arrows

/**
 * Calculate connection point on an element's perimeter
 */
export function getConnectionPoint(
  element: WBRect | WBEllipse, 
  focus: number,
  connectionPoint?: "auto" | "top" | "right" | "bottom" | "left" | "center"
): Point {
  const cx = element.x + (element.width || 0) / 2;
  const cy = element.y + (element.height || 0) / 2;
  
  if (connectionPoint === "center") {
    return [cx, cy];
  }
  
  if (connectionPoint && connectionPoint !== "auto") {
    const w = element.width || 0;
    const h = element.height || 0;
    switch (connectionPoint) {
      case "top": return [cx, element.y];
      case "right": return [element.x + w, cy];
      case "bottom": return [cx, element.y + h];
      case "left": return [element.x, cy];
    }
  }
  
  // Auto mode: calculate based on focus (0-1 around perimeter)
  if (element.kind === "rect") {
    const w = element.width || 0;
    const h = element.height || 0;
    const perimeter = 2 * (w + h);
    const position = focus * perimeter;
    
    if (position <= w) {
      // Top edge
      return [element.x + position, element.y];
    } else if (position <= w + h) {
      // Right edge
      return [element.x + w, element.y + (position - w)];
    } else if (position <= 2 * w + h) {
      // Bottom edge
      return [element.x + w - (position - w - h), element.y + h];
    } else {
      // Left edge
      return [element.x, element.y + h - (position - 2 * w - h)];
    }
  } else if (element.kind === "ellipse") {
    // For ellipses, use trigonometry
    const rx = (element.width || 0) / 2;
    const ry = (element.height || 0) / 2;
    const angle = focus * 2 * Math.PI;
    return [
      cx + rx * Math.cos(angle),
      cy + ry * Math.sin(angle)
    ];
  }
  
  return [cx, cy];
}

/**
 * Generate curved arrow path with automatic control points
 */
export function generateCurvedArrowPath(
  startPoint: Point,
  endPoint: Point,
  curvature: number = 0.5,
  arrowType: "straight" | "elbow" | "curved" = "curved"
): { points: Point[]; controlPoints?: Point[] } {
  const [x1, y1] = startPoint;
  const [x2, y2] = endPoint;
  
  if (arrowType === "straight") {
    return { points: [[0, 0], [x2 - x1, y2 - y1]] };
  }
  
  if (arrowType === "elbow") {
    // Create 90-degree elbow connection
    const midX = x1 + (x2 - x1) * 0.5;
    return { 
      points: [
        [0, 0],
        [midX - x1, 0],
        [midX - x1, y2 - y1],
        [x2 - x1, y2 - y1]
      ]
    };
  }
  
  // Curved arrow with Bezier control points
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Calculate control points based on curvature
  const controlOffset = distance * curvature * 0.5;
  const perpX = -dy / distance * controlOffset;
  const perpY = dx / distance * controlOffset;
  
  const midX = dx * 0.5;
  const midY = dy * 0.5;
  
  const cp1: Point = [midX + perpX, midY + perpY];
  const cp2: Point = [midX - perpX, midY - perpY];
  
  return {
    points: [[0, 0], [dx, dy]], // Start and end points
    controlPoints: [cp1, cp2]
  };
}

/**
 * Find the closest bindable element to a point
 */
export function findClosestBindableElement(
  point: Point,
  elements: WBObject[],
  excludeIds: string[] = []
): { element: WBRect | WBEllipse; connectionPoint: Point; focus: number } | null {
  let closest: { element: WBRect | WBEllipse; distance: number; connectionPoint: Point; focus: number } | null = null;
  
  for (const element of elements) {
    if (!isBindableElement(element) || excludeIds.includes(element.id)) {
      continue;
    }
    
    // Calculate closest point on element perimeter
    const cx = element.x + (element.width || 0) / 2;
    const cy = element.y + (element.height || 0) / 2;
    
    let closestPoint: Point;
    let focus: number;
    
    if (element.kind === "rect") {
      // Find closest point on rectangle perimeter
      const w = element.width || 0;
      const h = element.height || 0;
      const clampedX = Math.max(element.x, Math.min(point[0], element.x + w));
      const clampedY = Math.max(element.y, Math.min(point[1], element.y + h));
      
      // If point is inside, find closest edge
      if (clampedX > element.x && clampedX < element.x + w && 
          clampedY > element.y && clampedY < element.y + h) {
        const distances = [
          Math.abs(point[1] - element.y), // top
          Math.abs(point[0] - (element.x + w)), // right
          Math.abs(point[1] - (element.y + h)), // bottom
          Math.abs(point[0] - element.x) // left
        ];
        const minIndex = distances.indexOf(Math.min(...distances));
        
        switch (minIndex) {
          case 0: closestPoint = [point[0], element.y]; break;
          case 1: closestPoint = [element.x + w, point[1]]; break;
          case 2: closestPoint = [point[0], element.y + h]; break;
          case 3: closestPoint = [element.x, point[1]]; break;
          default: closestPoint = [clampedX, clampedY];
        }
      } else {
        closestPoint = [clampedX, clampedY];
      }
      
      // Calculate focus (0-1 around perimeter)
      const perimeter = 2 * (w + h);
      if (closestPoint[1] === element.y) {
        // Top edge
        focus = (closestPoint[0] - element.x) / perimeter;
      } else if (closestPoint[0] === element.x + w) {
        // Right edge
        focus = (w + (closestPoint[1] - element.y)) / perimeter;
      } else if (closestPoint[1] === element.y + h) {
        // Bottom edge
        focus = (w + h + (element.x + w - closestPoint[0])) / perimeter;
      } else {
        // Left edge
        focus = (2 * w + h + (element.y + h - closestPoint[1])) / perimeter;
      }
    } else {
      // Ellipse
      const rx = (element.width || 0) / 2;
      const ry = (element.height || 0) / 2;
      const dx = point[0] - cx;
      const dy = point[1] - cy;
      const angle = Math.atan2(dy, dx);
      
      closestPoint = [
        cx + rx * Math.cos(angle),
        cy + ry * Math.sin(angle)
      ];
      
      focus = (angle + Math.PI) / (2 * Math.PI);
    }
    
    const distance = Math.sqrt(
      (point[0] - closestPoint[0]) ** 2 + (point[1] - closestPoint[1]) ** 2
    );
    
    if (!closest || distance < closest.distance) {
      closest = { element, distance, connectionPoint: closestPoint, focus };
    }
  }
  
  return closest;
}

/**
 * Update bound arrows when an element moves
 */
export function updateBoundArrows(
  movedElement: WBObject,
  allElements: WBObject[]
): WBObject[] {
  const updatedElements: WBObject[] = [];
  
  for (const element of allElements) {
    if (isLinearElement(element)) {
      let needsUpdate = false;
      let updatedElement = { ...element };
      
      // Check start binding
      if (element.startBinding?.elementId === movedElement.id) {
        const connectionPoint = getConnectionPoint(
          movedElement as WBRect | WBEllipse,
          element.startBinding.focus,
          element.startBinding.connectionPoint
        );
        
        // Update arrow start point
        const newPoints = [...element.points];
        newPoints[0] = [connectionPoint[0] - element.x, connectionPoint[1] - element.y];
        updatedElement.points = newPoints;
        needsUpdate = true;
      }
      
      // Check end binding
      if (element.endBinding?.elementId === movedElement.id) {
        const connectionPoint = getConnectionPoint(
          movedElement as WBRect | WBEllipse,
          element.endBinding.focus,
          element.endBinding.connectionPoint
        );
        
        // Update arrow end point
        const newPoints = [...element.points];
        const lastIndex = newPoints.length - 1;
        newPoints[lastIndex] = [connectionPoint[0] - element.x, connectionPoint[1] - element.y];
        updatedElement.points = newPoints;
        needsUpdate = true;
        
        // Regenerate curved path if needed
        if (element.kind === "arrow" && element.arrowType === "curved") {
          const startPoint = element.points[0];
          const endPoint = newPoints[lastIndex];
          const curvedPath = generateCurvedArrowPath(
            [element.x + startPoint[0], element.y + startPoint[1]],
            [element.x + endPoint[0], element.y + endPoint[1]],
            element.curvature,
            element.arrowType
          );
                      updatedElement.points = curvedPath.points;
            if (element.kind === "arrow") {
              (updatedElement as WBArrow).controlPoints = curvedPath.controlPoints;
            }
        }
      }
      
      if (needsUpdate) {
        updatedElements.push(updateElementVersion(updatedElement));
      } else {
        updatedElements.push(element);
      }
    } else {
      updatedElements.push(element);
    }
  }
  
  return updatedElements;
}