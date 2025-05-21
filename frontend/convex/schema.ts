import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define your schema here
export default defineSchema({
  folders: defineTable({
    name: v.string(),
  }),
  sessions: defineTable({
    folderId: v.id("folders"),
    createdAt: v.number(),
  }),
  session_messages: defineTable({
    sessionId: v.id("sessions"),
    role: v.string(),
    content: v.string(),
  }).index("by_session", ["sessionId"]),
});
