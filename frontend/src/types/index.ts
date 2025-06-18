import { WhiteboardActionType, Metadata } from './canvas';
import { CanvasObjectSpec } from '@aitutor/whiteboard-schema';

// Base Canvas Object Specification
export interface CanvasObjectSpec {
  id: string;
  kind: string; // e.g., 'rect', 'circle', 'text', 'latex_svg', 'graph'
  x?: number | string; // allow percent strings
  y?: number | string;
  width?: number | string;
  height?: number | string;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
  angle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
  points?: any; // flexible
  radius?: number; // For circles
  src?: string; // for images
  label?: string;
  options?: any[];
  selectable?: boolean;
  evented?: boolean;
  groupId?: string;
  objects?: CanvasObjectSpec[];
  metadata?: (Partial<Metadata> & { id?: string }) & { [key: string]: any }; // Relaxed: allow partial metadata fields
  [key: string]: any; // catch-all for future props
}

// Specific Action Interfaces
export interface AddObjectsAction {
  type: WhiteboardActionType.ADD_OBJECTS;
  objects: CanvasObjectSpec[];
  // Optional fields for anchor-based layout strategy
  strategy?: 'anchor' | 'flow'; // 'flow' is default if strategy is omitted
  anchor_object_id?: string;
  anchor_edge_x?: 'left' | 'right' | 'center_x';
  object_edge_x?: 'left' | 'right' | 'center_x';
  anchor_edge_y?: 'top' | 'bottom' | 'center_y';
  object_edge_y?: 'top' | 'bottom' | 'center_y';
  offset_x_pct?: number;
  offset_y_pct?: number;
}

export interface UpdateObjectPayload {
  objectId: string;
  updates: Partial<CanvasObjectSpec>; // Allows partial updates to an object
}

export interface UpdateObjectsAction {
  type: WhiteboardActionType.UPDATE_OBJECTS;
  objects: UpdateObjectPayload[];
}

export interface DeleteObjectsAction {
  type: WhiteboardActionType.DELETE_OBJECTS;
  objectIds: string[];
}

export interface ClearBoardAction {
  type: WhiteboardActionType.CLEAR_BOARD;
  // scope?: 'all' | 'assistant_only' | 'visual_only'; // Previous provider had scope, might be needed later
}

// Ephemeral actions (based on previous switch cases in provider)
// These might need more specific payloads if they differ significantly
export interface AddEphemeralAction {
  type: WhiteboardActionType.ADD_EPHEMERAL; // Assuming this type exists in enum or will be added
  spec: CanvasObjectSpec; 
}

export interface DeleteEphemeralAction {
  type: WhiteboardActionType.DELETE_EPHEMERAL; // Assuming this type exists in enum or will be added
  id: string;
}

// Group related actions
export interface GroupObjectsAction {
  type: WhiteboardActionType.GROUP_OBJECTS;
  objectIds: string[];
  groupId: string;
}

export interface MoveGroupAction {
  type: WhiteboardActionType.MOVE_GROUP;
  groupId: string;
  dx: number;
  dy: number;
}

export interface DeleteGroupAction {
  type: WhiteboardActionType.DELETE_GROUP;
  groupId: string;
}

// Highlight action (Phase 3)
export interface HighlightObjectAction {
  type: WhiteboardActionType.HIGHLIGHT_OBJECT;
  targetObjectId: string;
  color?: string; // Hex colour sent by backend (defaults handled in provider)
  pulse?: boolean;
}

// WhiteboardAction Discriminated Union
export type WhiteboardAction =
  | AddObjectsAction
  | UpdateObjectsAction
  | DeleteObjectsAction
  | ClearBoardAction
  | AddEphemeralAction
  | DeleteEphemeralAction
  | GroupObjectsAction
  | MoveGroupAction
  | DeleteGroupAction
  | HighlightObjectAction;

// Export the enum directly for value usage
export { WhiteboardActionType } from './canvas'; 

// Export types using 'export type' for isolatedModules compatibility
export type { Metadata } from './canvas';
// CanvasObjectSpec and individual action interfaces are already exported with 'export interface' or 'export type' where defined.
// The WhiteboardAction union type is also already exported with 'export type'. 

export { CanvasObjectSpec, WhiteboardAction } from "@aitutor/whiteboard-schema";

// Former local definitions have been moved to the shared `@aitutor/whiteboard-schema` package. 