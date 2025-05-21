import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  folders: defineTable({
    user_id: v.string(),
    name: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
    vector_store_id: v.optional(v.string()),
    knowledge_base: v.optional(v.string()),
  })
    .index("by_user", ["user_id"])
    .index("by_vector_store", ["vector_store_id"]),

  sessions: defineTable({
    user_id: v.string(),
    context_data: v.any(),
    folder_id: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
    ended_at: v.optional(v.number()),
    analysis_status: v.optional(v.string()),
  })
    .index("by_user", ["user_id"])
    .index("by_folder", ["folder_id"]),

  session_messages: defineTable({
    session_id: v.string(),
    turn_no: v.number(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.optional(v.string()),
    payload_json: v.optional(v.any()),
    whiteboard_snapshot_index: v.optional(v.number()),
    created_at: v.number(),
  })
    .index("by_session_turn", ["session_id", "turn_no"])
    .index("by_session_created", ["session_id", "created_at"]),

  whiteboard_snapshots: defineTable({
    session_id: v.string(),
    snapshot_index: v.number(),
    actions_json: v.any(),
    created_at: v.number(),
  })
    .index("by_session_snapshot", ["session_id", "snapshot_index"])
    .index("by_session_created", ["session_id", "created_at"]),

  concept_events: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    concept: v.string(),
    outcome: v.string(),
    timestamp: v.number(),
    delta_mastery: v.float64(),
  })
    .index("by_session", ["session_id"])
    .index("by_user", ["user_id"])
    .index("by_concept", ["concept"]),

  actions: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    action_type: v.string(),
    action_details: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_user", ["user_id"]),

  action_weights: defineTable({
    action_type: v.string(),
    weight: v.float64(),
    updated_at: v.number(),
  }).index("by_type", ["action_type"]),

  edge_logs: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    tool: v.string(),
    latency_ms: v.optional(v.number()),
    prompt_tokens: v.optional(v.number()),
    completion_tokens: v.optional(v.number()),
    created_at: v.number(),
    trace_id: v.optional(v.string()),
    agent_version: v.optional(v.string()),
    turn_latency_ms: v.optional(v.number()),
  })
    .index("by_session", ["session_id"])
    .index("by_user", ["user_id"]),

  embeddings_cache: defineTable({
    hash: v.string(),
    vector_id: v.string(),
    metadata: v.optional(v.any()),
    created_at: v.number(),
  }).index("by_hash", ["hash"]),

  interaction_logs: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    role: v.string(),
    content: v.string(),
    content_type: v.string(),
    event_type: v.optional(v.string()),
    created_at: v.number(),
    trace_id: v.optional(v.string()),
  })
    .index("by_session_created", ["session_id", "created_at"])
    .index("by_user", ["user_id"]),

  uploaded_files: defineTable({
    supabase_path: v.string(),
    user_id: v.string(),
    folder_id: v.string(),
    embedding_status: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user", ["user_id"])
    .index("by_folder", ["folder_id"]),

  concept_graph: defineTable({
    prereq: v.string(),
    concept: v.string(),
  })
    .index("by_prereq", ["prereq"])
    .index("by_concept", ["concept"]),
});
