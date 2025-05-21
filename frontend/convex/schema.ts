import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define your schema here
export default defineSchema({
  interaction_logs: defineTable({
    session_id: v.string(),
    user_id: v.string(),
    role: v.string(),
    content: v.string(),
    content_type: v.string(),
    event_type: v.optional(v.string()),
    created_at: v.number(),
  }),
});
