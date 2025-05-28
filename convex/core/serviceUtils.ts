import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

// --- Utility Types ---

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

export interface LLMRetryOptions extends RetryOptions {
  temperatureIncrement?: number;
}

export interface ToolInvocationResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  executionTimeMs: number;
  retryCount: number;
}

// --- LLM Utilities ---

export async function retryOnJsonError<T>(
  asyncFunction: () => Promise<T>,
  options: LLMRetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 2,
    temperatureIncrement: 0.1,
  }
): Promise<T> {
  let lastException: Error | null = null;
  let currentDelay = options.initialDelay;
  
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await asyncFunction();
    } catch (error) {
      lastException = error as Error;
      
      // Check if this is a retryable error (JSON parsing, validation, etc.)
      const isRetryable = isRetryableError(error as Error);
      
      if (!isRetryable || attempt === options.maxRetries - 1) {
        throw error;
      }
      
      console.warn(`Attempt ${attempt + 1} of ${options.maxRetries} failed: ${lastException.message}. Retrying...`);
      
      // Add delay before retry
      await sleep(currentDelay);
      currentDelay = Math.min(currentDelay * options.backoffFactor, options.maxDelay);
    }
  }
  
  throw lastException || new Error("All retries failed");
}

function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  const retryableKeywords = [
    'json',
    'parse',
    'validation',
    'schema',
    'format',
    'timeout',
    'rate limit',
  ];
  
  return retryableKeywords.some(keyword => errorMessage.includes(keyword));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Tool Invocation Helpers ---

export async function invokeToolSafely<T>(
  toolFunction: () => Promise<T>,
  toolName: string,
  context?: any,
  options: RetryOptions = {
    maxRetries: 2,
    initialDelay: 500,
    maxDelay: 2000,
    backoffFactor: 2,
  }
): Promise<ToolInvocationResult<T>> {
  const startTime = Date.now();
  let retryCount = 0;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const result = await toolFunction();
      
      return {
        success: true,
        result,
        executionTimeMs: Date.now() - startTime,
        retryCount,
      };
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log the error
      console.error(`Tool '${toolName}' failed on attempt ${attempt + 1}:`, errorMessage);
      
      // If this is the last attempt, return the error
      if (attempt === options.maxRetries) {
        return {
          success: false,
          error: errorMessage,
          executionTimeMs: Date.now() - startTime,
          retryCount,
        };
      }
      
      // Wait before retry
      const delay = Math.min(
        options.initialDelay * Math.pow(options.backoffFactor, attempt),
        options.maxDelay
      );
      await sleep(delay);
    }
  }
  
  // Should never reach here, but as fallback
  return {
    success: false,
    error: "Unknown error in tool invocation",
    executionTimeMs: Date.now() - startTime,
    retryCount,
  };
}

// --- Context Management Utilities ---

export function extractContextData(context: any): {
  sessionId?: string;
  userId?: string;
  vectorStoreId?: string;
  analysisResult?: any;
  lessonPlan?: any;
} {
  if (!context) {
    return {};
  }
  
  return {
    sessionId: context.session_id || context.sessionId,
    userId: context.user_id || context.userId,
    vectorStoreId: context.vector_store_id || context.vectorStoreId,
    analysisResult: context.analysis_result || context.analysisResult,
    lessonPlan: context.lesson_plan || context.lessonPlan,
  };
}

export function validateContextRequirements(
  context: any,
  requirements: string[]
): { valid: boolean; missing: string[] } {
  const contextData = extractContextData(context);
  const missing: string[] = [];
  
  for (const requirement of requirements) {
    if (!contextData[requirement as keyof typeof contextData]) {
      missing.push(requirement);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

// --- Data Validation Utilities ---

export function validateRequired(
  data: Record<string, any>,
  requiredFields: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

export function sanitizeInput(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    return String(input);
  }
  
  // Remove potentially dangerous characters and limit length
  return input
    .replace(/[<>]/g, '') // Remove HTML-like tags
    .slice(0, maxLength)
    .trim();
}

// --- Performance Monitoring ---

export const logPerformanceMetric = mutation({
  args: {
    operation: v.string(),
    duration: v.number(),
    success: v.boolean(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("performance_metrics", {
      operation: args.operation,
      duration: args.duration,
      success: args.success,
      metadata: args.metadata,
      timestamp: Date.now(),
    });
  },
});

export const getPerformanceStats = query({
  args: {
    operation: v.optional(v.string()),
    timeRange: v.optional(v.object({
      startTime: v.number(),
      endTime: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const timeRange = args.timeRange || {
      startTime: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
      endTime: Date.now(),
    };

    let metricsQuery = ctx.db
      .query("performance_metrics")
      .filter((q) => 
        q.and(
          q.gte(q.field("timestamp"), timeRange.startTime),
          q.lte(q.field("timestamp"), timeRange.endTime)
        )
      );

    if (args.operation) {
      metricsQuery = metricsQuery.filter((q) => q.eq(q.field("operation"), args.operation));
    }

    const metrics = await metricsQuery.collect();

    if (metrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        successRate: 0,
        minDuration: 0,
        maxDuration: 0,
      };
    }

    const durations = metrics.map(m => m.duration);
    const successCount = metrics.filter(m => m.success).length;

    return {
      totalOperations: metrics.length,
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      successRate: (successCount / metrics.length) * 100,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
    };
  },
});

// --- Error Handling Utilities ---

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function handleServiceError(error: unknown, operation: string): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }
  
  if (error instanceof ConvexError) {
    return new ServiceError(String(error), 'CONVEX_ERROR', { operation });
  }
  
  if (error instanceof Error) {
    return new ServiceError(error.message, 'UNKNOWN_ERROR', { operation, originalError: error.name });
  }
  
  return new ServiceError(
    `Unknown error in ${operation}`, 
    'UNKNOWN_ERROR', 
    { operation, originalError: String(error) }
  );
}

// --- Caching Utilities ---

export const setCachedValue = mutation({
  args: {
    key: v.string(),
    value: v.any(),
    ttl: v.optional(v.number()), // Time to live in milliseconds
  },
  handler: async (ctx, args) => {
    const expiresAt = args.ttl ? Date.now() + args.ttl : undefined;
    
    // Try to update existing cache entry
    const existing = await ctx.db
      .query("cache_entries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updated_at: Date.now(),
        expires_at: expiresAt,
      });
    } else {
      await ctx.db.insert("cache_entries", {
        key: args.key,
        value: args.value,
        created_at: Date.now(),
        updated_at: Date.now(),
        expires_at: expiresAt,
      });
    }
  },
});

export const getCachedValue = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("cache_entries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    
    if (!entry) {
      return null;
    }
    
    // Check if entry has expired
    if (entry.expires_at && entry.expires_at < Date.now()) {
      // Return null for expired entries (cleanup will be handled by a separate background job)
      return null;
    }
    
    return entry.value;
  },
});

export const clearCache = mutation({
  args: {
    keyPattern: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let entriesToDelete;
    
    if (args.keyPattern) {
      // Find entries matching pattern
      const allEntries = await ctx.db.query("cache_entries").collect();
      entriesToDelete = allEntries.filter(entry => 
        entry.key.includes(args.keyPattern!)
      );
    } else {
      // Clear all entries
      entriesToDelete = await ctx.db.query("cache_entries").collect();
    }
    
    let deletedCount = 0;
    for (const entry of entriesToDelete) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }
    
    return { deletedCount };
  },
});

// --- Batch Processing Utilities ---

export async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    maxConcurrency?: number;
  } = {}
): Promise<Array<{ success: boolean; result?: R; error?: string; index: number }>> {
  const {
    batchSize = 10,
    delayBetweenBatches = 100,
    maxConcurrency = 5,
  } = options;
  
  const results: Array<{ success: boolean; result?: R; error?: string; index: number }> = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (item, batchIndex) => {
      const globalIndex = i + batchIndex;
      try {
        const result = await processor(item, globalIndex);
        return { success: true, result, index: globalIndex };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          index: globalIndex,
        };
      }
    });
    
    // Process batch with concurrency limit
    const batchResults = await Promise.allSettled(
      batchPromises.slice(0, maxConcurrency)
    );
    
    results.push(...batchResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason?.message || String(result.reason),
          index: i + index,
        };
      }
    }));
    
    // Add delay between batches
    if (i + batchSize < items.length && delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }
  }
  
  return results;
}

// --- Configuration Management ---

export const getConfig = query({
  args: {
    key: v.string(),
    defaultValue: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    
    return config?.value ?? args.defaultValue ?? null;
  },
});

export const setConfig = mutation({
  args: {
    key: v.string(),
    value: v.any(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("system_config")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        description: args.description,
        updated_at: Date.now(),
      });
    } else {
      await ctx.db.insert("system_config", {
        key: args.key,
        value: args.value,
        description: args.description,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }
  },
});

// --- Feature Flag Management ---

export const getFeatureFlag = query({
  args: {
    flagName: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flag = await ctx.db
      .query("feature_flags")
      .withIndex("by_name", (q) => q.eq("name", args.flagName))
      .first();
    
    if (!flag) {
      return false; // Default to disabled
    }
    
    // Check if flag is globally enabled
    if (flag.enabled_globally) {
      return true;
    }
    
    // Check user-specific enablement
    if (args.userId && flag.enabled_users?.includes(args.userId)) {
      return true;
    }
    
    // Check percentage rollout
    if (flag.rollout_percentage && args.userId) {
      const hash = hashString(args.userId + flag.name);
      const percentage = (hash % 100) + 1;
      return percentage <= flag.rollout_percentage;
    }
    
    return false;
  },
});

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
} 