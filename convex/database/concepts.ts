import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireAuth, checkRateLimit } from "../auth/middleware";

// ==========================================
// CONCEPT GRAPH CRUD OPERATIONS
// ==========================================

// Define the edge result type to avoid circular inference
type ConceptGraphEdge = {
  prereq: string;
  concept: string;
};

/**
 * Get all concept graph edges (prerequisite relationships)
 */
export const getAllConceptGraphEdges = query({
  args: {},
  handler: async (ctx): Promise<ConceptGraphEdge[]> => {
    const edges = await ctx.db
      .query("concept_graph")
      .collect();
    
    return edges.map(edge => ({
      prereq: edge.prereq,
      concept: edge.concept
    }));
  }
});

/**
 * Get concept graph edges for specific concepts
 */
export const getConceptGraphEdgesByCondition = query({
  args: {
    prereqs: v.optional(v.array(v.string())),
    concepts: v.optional(v.array(v.string()))
  },
  handler: async (ctx, { prereqs, concepts }) => {
    let edges = await ctx.db
      .query("concept_graph")
      .collect();
    
    // Filter by prereqs if provided
    if (prereqs && prereqs.length > 0) {
      edges = edges.filter(edge => prereqs.includes(edge.prereq));
    }
    
    // Filter by concepts if provided
    if (concepts && concepts.length > 0) {
      edges = edges.filter(edge => concepts.includes(edge.concept));
    }
    
    return edges.map(edge => ({
      prereq: edge.prereq,
      concept: edge.concept
    }));
  }
});

/**
 * Get prerequisites for a specific concept
 */
export const getConceptPrerequisites = query({
  args: { concept: v.string() },
  handler: async (ctx, { concept }) => {
    const edges = await ctx.db
      .query("concept_graph")
      .withIndex("by_concept", (q) => q.eq("concept", concept))
      .collect();
    
    return edges.map(edge => edge.prereq);
  }
});

/**
 * Get concepts that depend on a specific prerequisite
 */
export const getConceptsByPrerequisite = query({
  args: { prereq: v.string() },
  handler: async (ctx, { prereq }) => {
    const edges = await ctx.db
      .query("concept_graph")
      .withIndex("by_prereq", (q) => q.eq("prereq", prereq))
      .collect();
    
    return edges.map(edge => edge.concept);
  }
});

/**
 * Add a new concept graph edge
 */
export const addConceptGraphEdge = mutation({
  args: {
    prereq: v.string(),
    concept: v.string()
  },
  handler: async (ctx, { prereq, concept }) => {
    // Check if edge already exists
    const existing = await ctx.db
      .query("concept_graph")
      .filter((q) => q.and(
        q.eq(q.field("prereq"), prereq),
        q.eq(q.field("concept"), concept)
      ))
      .first();
    
    if (existing) {
      return { success: false, error: "Edge already exists" };
    }
    
    const edgeId = await ctx.db.insert("concept_graph", {
      prereq,
      concept
    });
    
    return { success: true, edgeId };
  }
});

/**
 * Add multiple concept graph edges in batch
 */
export const addConceptGraphEdges = mutation({
  args: {
    edges: v.array(v.object({
      prereq: v.string(),
      concept: v.string()
    }))
  },
  handler: async (ctx, { edges }) => {
    const results = [];
    
    for (const edge of edges) {
      // Check if edge already exists
      const existing = await ctx.db
        .query("concept_graph")
        .filter((q) => q.and(
          q.eq(q.field("prereq"), edge.prereq),
          q.eq(q.field("concept"), edge.concept)
        ))
        .first();
      
      if (!existing) {
        const edgeId = await ctx.db.insert("concept_graph", edge);
        results.push({ success: true, edgeId, edge });
      } else {
        results.push({ success: false, error: "Edge already exists", edge });
      }
    }
    
    return {
      success: true,
      total: edges.length,
      inserted: results.filter(r => r.success).length,
      results
    };
  }
});

/**
 * Remove a concept graph edge
 */
export const removeConceptGraphEdge = mutation({
  args: {
    prereq: v.string(),
    concept: v.string()
  },
  handler: async (ctx, { prereq, concept }) => {
    const edge = await ctx.db
      .query("concept_graph")
      .filter((q) => q.and(
        q.eq(q.field("prereq"), prereq),
        q.eq(q.field("concept"), concept)
      ))
      .first();
    
    if (!edge) {
      return { success: false, error: "Edge not found" };
    }
    
    await ctx.db.delete(edge._id);
    
    return { success: true };
  }
});

/**
 * Clear all concept graph edges
 */
export const clearConceptGraph = mutation({
  args: {},
  handler: async (ctx) => {
    const edges = await ctx.db
      .query("concept_graph")
      .collect();
    
    for (const edge of edges) {
      await ctx.db.delete(edge._id);
    }
    
    return { success: true, deletedCount: edges.length };
  }
}); 