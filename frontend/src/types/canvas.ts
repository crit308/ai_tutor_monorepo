import { z } from 'zod';

// Mirrors the Pydantic Metadata model in agent_t/services/whiteboard_metadata.py
export const MetadataSchema = z.object({
  source: z.enum(['assistant', 'user']),
  role: z.string(), // e.g. "interactive_concept"
  semantic_tags: z.array(z.string()).default([]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), // x,y,width,height (canvas units)
  group_id: z.string().optional().nullable(), // Allow optional and nullable to match Pydantic's Optional[str] = None
});

export type Metadata = z.infer<typeof MetadataSchema>;

// Enum for WhiteboardAction types
export enum WhiteboardActionType {
  ADD_OBJECTS = 'ADD_OBJECTS',
  UPDATE_OBJECTS = 'UPDATE_OBJECTS', // Note: Plan Phase 1 Backend uses UPDATE_OBJECTS (plural) in WhiteboardAction, skill uses UPDATE_OBJECT (singular). Will align to plural here as per plan's WhiteboardAction definition.
  DELETE_OBJECTS = 'DELETE_OBJECTS',
  CLEAR_BOARD = 'CLEAR_BOARD',
  CLEAR_CANVAS = 'CLEAR_CANVAS',
  ADD_EPHEMERAL = 'ADD_EPHEMERAL',       // Added based on provider switch cases
  DELETE_EPHEMERAL = 'DELETE_EPHEMERAL', // Added based on provider switch cases
  GROUP_OBJECTS = 'GROUP_OBJECTS',
  MOVE_GROUP = 'MOVE_GROUP',
  DELETE_GROUP = 'DELETE_GROUP',
  HIGHLIGHT_OBJECT = 'HIGHLIGHT_OBJECT',
} 