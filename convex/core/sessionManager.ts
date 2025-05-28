import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Type definitions for TutorContext (ported from Python)
export interface UserConceptMastery {
  mastery_level: number;
  last_updated: number;
  confidence: number;
  interactions_count: number;
}

export interface UserModelState {
  concepts: Record<string, UserConceptMastery>;
  overall_progress: number;
  current_topic: string | null;
  session_summary: string;
}

export interface AnalysisResult {
  analysis_text?: string;
  [key: string]: any;
}

export interface LessonPlan {
  [key: string]: any;
}

export interface QuizQuestion {
  [key: string]: any;
}

export interface FocusObjective {
  [key: string]: any;
}

export interface TutorContext {
  state?: string;
  user_id: string;
  session_id: string;
  folder_id?: string;
  vector_store_id?: string;
  session_goal?: string;
  interaction_mode: 'chat_only' | 'chat_and_whiteboard';
  uploaded_file_paths: string[];
  analysis_result?: AnalysisResult;
  knowledge_base_path?: string;
  lesson_plan?: LessonPlan;
  current_quiz_question?: QuizQuestion;
  current_focus_objective?: FocusObjective;
  user_model_state: UserModelState;
  last_interaction_summary?: string;
  current_teaching_topic?: string;
  whiteboard_history: Array<Array<Record<string, any>>>;
  history: Array<{ role: string; content: string }>;
  last_pedagogical_action?: "explained" | "asked" | "evaluated" | "remediated";
  last_event?: Record<string, any>;
  pending_interaction_type?: string;
  high_cost_calls: number;
  max_high_cost_calls: number;
  latest_turn_no: number;
  latest_snapshot_index: number;
}

// In-memory cache for session contexts (for performance)
const sessionCache = new Map<string, { context: TutorContext; lastAccessed: number; }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

// Garbage collection for cache
function cleanupCache(): void {
  const now = Date.now();
  const entries = Array.from(sessionCache.entries());
  
  // Remove expired entries
  for (const [sessionId, data] of entries) {
    if (now - data.lastAccessed > CACHE_TTL) {
      sessionCache.delete(sessionId);
    }
  }
  
  // If still too large, remove oldest entries
  if (sessionCache.size > MAX_CACHE_SIZE) {
    const sortedEntries = entries
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
      .slice(0, sessionCache.size - MAX_CACHE_SIZE);
    
    for (const [sessionId] of sortedEntries) {
      sessionCache.delete(sessionId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000);

export class SessionManager {
  constructor(private baseUrl: string, private adminKey: string) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.adminKey}`,
      'Content-Type': 'application/json',
    };
  }

  private createDefaultUserModelState(): UserModelState {
    return {
      concepts: {},
      overall_progress: 0,
      current_topic: null,
      session_summary: "",
    };
  }

  private createDefaultTutorContext(
    userId: string, 
    sessionId: string, 
    folderId?: string
  ): TutorContext {
    return {
      user_id: userId,
      session_id: sessionId,
      folder_id: folderId,
      interaction_mode: 'chat_and_whiteboard',
      uploaded_file_paths: [],
      user_model_state: this.createDefaultUserModelState(),
      whiteboard_history: [],
      history: [],
      high_cost_calls: 0,
      max_high_cost_calls: 3,
      latest_turn_no: 0,
      latest_snapshot_index: 0,
    };
  }

  /**
   * Creates a new session with comprehensive initialization
   */
  async createSession(
    userId: string, 
    folderId?: string, 
    initialContext?: Partial<TutorContext>
  ): Promise<string> {
    console.log(`Creating new session for user ${userId}. Linked folder: ${folderId ?? 'None'}`);

    // Create base context
    const sessionId = crypto.randomUUID();
    const baseContext = this.createDefaultTutorContext(userId, sessionId, folderId);
    
    // Merge with any provided initial context
    const context = { ...baseContext, ...initialContext };

    // If folder is provided, fetch folder data for initial context
    if (folderId) {
      try {
        const folderData = await this.fetchFolderData(folderId, userId);
        if (folderData) {
          context.vector_store_id = folderData.vector_store_id;
          context.knowledge_base_path = folderData.knowledge_base;
          context.session_goal = `Study materials from folder: ${folderData.name}`;
        }
      } catch (error) {
        console.warn(`Failed to fetch folder data for ${folderId}:`, error);
        // Continue with session creation even if folder fetch fails
      }
    }

    // Create session in database
    const payload = { 
      userId, 
      context: this.leanContext(context), 
      folderId: folderId ?? null 
    };
    
    const res = await fetch(`${this.baseUrl}/createSession`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const createdSessionId = data.id as string;
    
    // Cache the context
    context.session_id = createdSessionId;
    this.cacheContext(createdSessionId, context);
    
    console.log(`Created session ${createdSessionId} for user ${userId}`);
    return createdSessionId;
  }

  /**
   * Retrieves and validates session context with caching
   */
  async getSessionContext(sessionId: string, userId: string): Promise<TutorContext | null> {
    console.log(`Fetching session context for ${sessionId}, user ${userId}`);

    // Check cache first
    const cached = sessionCache.get(sessionId);
    if (cached && cached.context.user_id === userId) {
      cached.lastAccessed = Date.now();
      console.log(`Session context cache hit for ${sessionId}`);
      return cached.context;
    }

    // Fetch from database
    try {
      const params = new URLSearchParams({ sessionId, userId });
      const res = await fetch(`${this.baseUrl}/getSessionContext?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.adminKey}` },
      });

      if (res.status === 404) {
        console.log(`No session found for ${sessionId}, user ${userId}`);
        return null;
      }
      
      if (!res.ok) {
        throw new Error(`Failed to fetch context: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      const contextData = data.context;
      
      if (!contextData) {
        console.warn(`Session ${sessionId} found but context_data is null`);
        return null;
      }

      // Parse and validate context
      let contextDict: any;
      if (typeof contextData === 'string') {
        try {
          contextDict = JSON.parse(contextData);
        } catch (error) {
          console.error(`Failed to parse JSON context for session ${sessionId}:`, error);
          return null;
        }
      } else if (typeof contextData === 'object') {
        contextDict = contextData;
      } else {
        console.error(`Invalid context data type for session ${sessionId}:`, typeof contextData);
        return null;
      }

      // Ensure core IDs are present
      contextDict.session_id = sessionId;
      contextDict.user_id = userId;

      // Validate and build TutorContext
      const context = this.validateAndBuildContext(contextDict);
      if (!context) {
        console.error(`Failed to validate context for session ${sessionId}`);
        return null;
      }

      // Cache the validated context
      this.cacheContext(sessionId, context);
      
      console.log(`Session context successfully fetched and cached for ${sessionId}`);
      return context;

    } catch (error) {
      console.error(`Error fetching session context for ${sessionId}:`, error);
      throw new Error(`Internal error fetching session context: ${error}`);
    }
  }

  /**
   * Updates session context with optimizations
   */
  async updateSessionContext(sessionId: string, userId: string, context: TutorContext): Promise<boolean> {
    console.log(`Updating session context for ${sessionId}, user ${userId}`);

    try {
      // Update cache first for immediate consistency
      this.cacheContext(sessionId, context);

      // Serialize lean context (without bulky histories)
      const leanContext = this.leanContext(context);

      const payload = { sessionId, userId, context: leanContext };
      const res = await fetch(`${this.baseUrl}/updateSessionContext`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(`Failed to update context for ${sessionId}: ${res.status} ${res.statusText}`);
        // Remove from cache on failure
        sessionCache.delete(sessionId);
        return false;
      }

      console.log(`Session context updated successfully for ${sessionId}`);
      return true;

    } catch (error) {
      console.error(`Error updating session context for ${sessionId}:`, error);
      // Remove from cache on error
      sessionCache.delete(sessionId);
      return false;
    }
  }

  /**
   * Checks if a session exists and belongs to the user
   */
  async sessionExists(sessionId: string, userId: string): Promise<boolean> {
    try {
      const context = await this.getSessionContext(sessionId, userId);
      return context !== null;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a session and cleans up associated data
   */
  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    try {
      // Remove from cache first
      sessionCache.delete(sessionId);

      const payload = { sessionId, userId };
      const res = await fetch(`${this.baseUrl}/deleteSession`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(`Failed to delete session ${sessionId}: ${res.status}`);
        return false;
      }

      console.log(`Session ${sessionId} deleted successfully`);
      return true;

    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Lists sessions for a user with pagination
   */
  async listUserSessions(
    userId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<Array<{ id: string; created_at: number; folder_id?: string; }>> {
    try {
      const params = new URLSearchParams({ 
        userId, 
        limit: limit.toString(), 
        offset: offset.toString() 
      });
      
      const res = await fetch(`${this.baseUrl}/listUserSessions?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.adminKey}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to list sessions: ${res.status}`);
      }

      const data = await res.json();
      return data.sessions || [];

    } catch (error) {
      console.error(`Error listing sessions for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Cleanup expired sessions (garbage collection)
   */
  async cleanupExpiredSessions(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const payload = { maxAgeMs };
      const res = await fetch(`${this.baseUrl}/cleanupExpiredSessions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(`Failed to cleanup sessions: ${res.status}`);
        return 0;
      }

      const data = await res.json();
      const deletedCount = data.deletedCount || 0;
      
      console.log(`Cleaned up ${deletedCount} expired sessions`);
      return deletedCount;

    } catch (error) {
      console.error('Error during session cleanup:', error);
      return 0;
    }
  }

  // Private helper methods

  private async fetchFolderData(folderId: string, userId: string): Promise<any> {
    const params = new URLSearchParams({ folderId, userId });
    const res = await fetch(`${this.baseUrl}/getFolderData?${params}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.adminKey}` },
    });
    
    if (!res.ok) return null;
    return res.json();
  }

  private validateAndBuildContext(contextDict: any): TutorContext | null {
    try {
      // Build context with defaults for missing fields
      const context: TutorContext = {
        state: contextDict.state,
        user_id: contextDict.user_id,
        session_id: contextDict.session_id,
        folder_id: contextDict.folder_id,
        vector_store_id: contextDict.vector_store_id,
        session_goal: contextDict.session_goal,
        interaction_mode: contextDict.interaction_mode || 'chat_and_whiteboard',
        uploaded_file_paths: contextDict.uploaded_file_paths || [],
        analysis_result: contextDict.analysis_result,
        knowledge_base_path: contextDict.knowledge_base_path,
        lesson_plan: contextDict.lesson_plan,
        current_quiz_question: contextDict.current_quiz_question,
        current_focus_objective: contextDict.current_focus_objective,
        user_model_state: contextDict.user_model_state || this.createDefaultUserModelState(),
        last_interaction_summary: contextDict.last_interaction_summary,
        current_teaching_topic: contextDict.current_teaching_topic,
        whiteboard_history: contextDict.whiteboard_history || [],
        history: contextDict.history || [],
        last_pedagogical_action: contextDict.last_pedagogical_action,
        last_event: contextDict.last_event,
        pending_interaction_type: contextDict.pending_interaction_type,
        high_cost_calls: contextDict.high_cost_calls || 0,
        max_high_cost_calls: contextDict.max_high_cost_calls || 3,
        latest_turn_no: contextDict.latest_turn_no || 0,
        latest_snapshot_index: contextDict.latest_snapshot_index || 0,
      };

      return context;
    } catch (error) {
      console.error('Error validating context:', error);
      return null;
    }
  }

  private leanContext(context: TutorContext): Partial<TutorContext> {
    // Return lean version without bulky fields (they're stored in separate tables)
    const { history, whiteboard_history, ...leanContext } = context;
    return leanContext;
  }

  private cacheContext(sessionId: string, context: TutorContext): void {
    sessionCache.set(sessionId, {
      context: { ...context },
      lastAccessed: Date.now(),
    });
  }
}

// Export the legacy interface for compatibility
export interface SessionContext {
  [key: string]: any;
}
