import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
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
    // Phase 4 additions
    analytics: v.optional(v.any()),
    context: v.optional(v.any()), // Alias for context_data compatibility
  })
    .index("by_user", ["user_id"])
    .index("by_folder", ["folder_id"]),

  files: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    storage_id: v.id("_storage"),
    file_name: v.string(),
    file_type: v.string(),
    file_size: v.number(),
    upload_status: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_user", ["user_id"]),

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

  whiteboard_objects: defineTable({
    session_id: v.string(),
    object_id: v.string(),
    object_spec: v.string(), // JSON string of CanvasObjectSpec
    object_kind: v.string(),  // e.g., 'circle', 'text', 'latex_svg'
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_session_object", ["session_id", "object_id"])
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
    // Phase 4 additions
    interaction_type: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    data: v.optional(v.any()),
  })
    .index("by_session_created", ["session_id", "created_at"])
    .index("by_user", ["user_id"])
    .index("by_session", ["session_id"]),

  uploaded_files: defineTable({
    supabase_path: v.string(),
    user_id: v.string(),
    folder_id: v.string(),
    embedding_status: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
    // Phase 4 additions
    session_id: v.optional(v.string()),
    filename: v.optional(v.string()),
    mime_type: v.optional(v.string()),
    vector_store_id: v.optional(v.string()),
    file_id: v.optional(v.string()),
    uploaded_at: v.optional(v.number()),
    processed_at: v.optional(v.number()),
  })
    .index("by_user", ["user_id"])
    .index("by_folder", ["folder_id"])
    .index("by_session_id", ["session_id"])
    .index("by_embedding_status", ["embedding_status"]),

  concept_graph: defineTable({
    prereq: v.string(),
    concept: v.string(),
  })
    .index("by_prereq", ["prereq"])
    .index("by_concept", ["concept"]),

  // Phase 4: Background Jobs and Complex Workflows
  background_jobs: defineTable({
    job_type: v.string(),
    job_data: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"), 
      v.literal("completed"),
      v.literal("failed")
    ),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    progress: v.number(),
    created_at: v.number(),
    started_at: v.optional(v.number()),
    completed_at: v.optional(v.number()),
    error_message: v.optional(v.string()),
    scheduled_for: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["job_type"])
    .index("by_priority", ["priority"])
    .index("by_created", ["created_at"]),

  // Analytics and Metrics Tables
  tool_metrics: defineTable({
    tool_name: v.string(),
    latency_ms: v.number(),
    success: v.boolean(),
    session_id: v.optional(v.string()),
    user_id: v.optional(v.string()),
    agent_version: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_tool", ["tool_name"])
    .index("by_session", ["session_id"])
    .index("by_timestamp", ["timestamp"]),

  tool_aggregates: defineTable({
    aggregate_key: v.string(), // tool_name:date
    tool_name: v.string(),
    date: v.string(), // YYYY-MM-DD
    total_invocations: v.number(),
    total_latency_ms: v.number(),
    success_count: v.number(),
    failure_count: v.number(),
    average_latency_ms: v.number(),
    updated_at: v.number(),
  })
    .index("by_key_date", ["aggregate_key"])
    .index("by_tool_date", ["tool_name", "date"]),

  token_usage: defineTable({
    model: v.string(),
    prompt_tokens: v.number(),
    completion_tokens: v.number(),
    total_tokens: v.number(),
    phase: v.union(
      v.literal("analysis"),
      v.literal("planning"), 
      v.literal("generation"),
      v.literal("interaction")
    ),
    session_id: v.optional(v.string()),
    user_id: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_model", ["model"])
    .index("by_session", ["session_id"])
    .index("by_timestamp", ["timestamp"]),

  token_aggregates: defineTable({
    aggregate_key: v.string(), // model:phase:date
    model: v.string(),
    phase: v.string(),
    date: v.string(), // YYYY-MM-DD
    total_tokens: v.number(),
    total_requests: v.number(),
    average_tokens_per_request: v.number(),
    updated_at: v.number(),
  })
    .index("by_key_date", ["aggregate_key"])
    .index("by_model_phase", ["model", "phase"]),

  // Performance and Monitoring
  performance_metrics: defineTable({
    operation: v.string(),
    duration: v.number(),
    success: v.boolean(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_operation", ["operation"])
    .index("by_timestamp", ["timestamp"]),

  // Cache System
  cache_entries: defineTable({
    key: v.string(),
    value: v.any(),
    created_at: v.number(),
    updated_at: v.number(),
    expires_at: v.optional(v.number()),
  }).index("by_key", ["key"]),

  // Configuration Management
  system_config: defineTable({
    key: v.string(),
    value: v.any(),
    description: v.optional(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_key", ["key"]),

  // Feature Flags
  feature_flags: defineTable({
    name: v.string(),
    enabled_globally: v.boolean(),
    enabled_users: v.optional(v.array(v.string())),
    rollout_percentage: v.optional(v.number()),
    created_at: v.number(),
    updated_at: v.number(),
  }).index("by_name", ["name"]),

  // Real-time Events
  realtime_events: defineTable({
    event_type: v.string(),
    session_id: v.optional(v.string()),
    user_id: v.optional(v.string()),
    event_data: v.any(),
    timestamp: v.number(),
  })
    .index("by_type", ["event_type"])
    .index("by_session", ["session_id"])
    .index("by_timestamp", ["timestamp"]),

  // Error Logs
  error_logs: defineTable({
    error_type: v.string(),
    error_message: v.string(),
    session_id: v.optional(v.string()),
    user_id: v.optional(v.string()),
    timestamp: v.number(),
    stack_trace: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_type", ["error_type"])
    .index("by_session", ["session_id"])
    .index("by_timestamp", ["timestamp"]),

  // System Status
  system_status: defineTable({
    component: v.string(),
    status: v.union(v.literal("healthy"), v.literal("warning"), v.literal("error")),
    message: v.optional(v.string()),
    metrics: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_component", ["component"])
    .index("by_timestamp", ["timestamp"]),

  user_model_updates: defineTable({
    user_id: v.string(),
    context_data: v.any(),
    metadata: v.optional(v.any()),
    created_at: v.number(),
  }).index("by_user_created", ["user_id", "created_at"]),

  mini_quiz_attempts: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    attempt_data: v.any(),
    created_at: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_user", ["user_id"]),

  user_summaries: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    summary_data: v.any(),
    created_at: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_user", ["user_id"]),

  concept_graph_nodes: defineTable({
    user_id: v.string(),
    session_id: v.optional(v.string()),
    concept_id: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    mastery_level: v.number(),
    prerequisites: v.array(v.string()),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user", ["user_id"])
    .index("by_session", ["session_id"])
    .index("by_concept_id", ["concept_id"]),

  concept_graph_edges: defineTable({
    user_id: v.string(),
    session_id: v.optional(v.string()),
    from_concept: v.string(),
    to_concept: v.string(),
    relationship_type: v.string(),
    strength: v.number(),
    created_at: v.number(),
  })
    .index("by_user", ["user_id"])
    .index("by_session", ["session_id"])
    .index("by_from_concept", ["from_concept"])
    .index("by_to_concept", ["to_concept"]),

  // Skills Migration Tables (MVP)
  skill_metrics: defineTable({
    skill: v.string(),
    content_type: v.optional(v.string()),
    batch_id: v.string(),
    session_id: v.string(),
    elapsed_ms: v.optional(v.number()),
    error: v.optional(v.string()),
    timestamp: v.number(),
    status: v.union(v.literal("started"), v.literal("success"), v.literal("error")),
  })
    .index("by_session", ["session_id"])
    .index("by_skill", ["skill"])
    .index("by_batch", ["batch_id"]),

  whiteboard_actions: defineTable({
    session_id: v.string(),
    action: v.any(),
    payload: v.any(),
    batch_id: v.string(),
    timestamp: v.number(),
  })
    .index("by_session", ["session_id"])
    .index("by_batch", ["batch_id"]),

  batch_efficiency: defineTable({
    batch_id: v.string(),
    operations_count: v.number(),
    actions_created: v.number(),
    websocket_reduction: v.number(),
    session_id: v.string(),
    timestamp: v.number(),
  }).index("by_session", ["session_id"]),

  migration_log: defineTable({
    action: v.string(),
    details: v.string(),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
}); 