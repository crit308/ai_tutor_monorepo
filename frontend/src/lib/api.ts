import axios from 'axios';
import {
  StartSessionResponse,
  UploadDocumentsResponse,
  LessonPlan,
  QuizUserAnswers,
  QuizFeedback,
  SessionAnalysis,
  InteractionRequestData,
  InteractionResponseData,
  FolderCreateRequest,
  FolderResponse,
} from './types';
import { getAuthToken } from './authToken';
import { ConvexReactClient } from 'convex/react';
import { api as convexApi } from 'convex_generated/api';
import { Id } from 'convex_generated/dataModel';

// Note: For authenticated calls, use the ConvexReactClient from the provider context
// This fallback client is for non-authenticated calls only
import { convex as fallbackConvex } from './convex';

// Default to the local Convex proxy if no environment variable is set.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Axios interceptor to add Auth token ---
apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Handle network errors (like CORS) and wrap them in BackendUnavailableError
class BackendUnavailableError extends Error {}
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      console.error('Network or CORS error detected:', error);
      throw new BackendUnavailableError('Backend unavailable');
    }
    return Promise.reject(error);
  }
);

// --- Session Management ---

export const startSession = async (
  folderId: string, 
  metadata?: {
    clientVersion?: string;
    userAgent?: string;
    timezone?: string;
  },
  convexClient?: ConvexReactClient
): Promise<StartSessionResponse> => {
  const convex = convexClient || fallbackConvex;
  
  // Ensure we have a proper Convex client
  if (!convex) {
    throw new Error('Convex client not available - authentication may not be properly initialized');
  }
  
  try {
    console.log(`Creating new session for folder ${folderId} via Convex...`);
    console.log('Using convex client:', !!convex);
    
    // Add a small delay to ensure auth state is stable
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const res = await convex.mutation(convexApi.functions.createSession, { 
      folderId: folderId as Id<"folders">,
      metadata: {
        clientVersion: "2.0.0",
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...metadata
      }
    });
    
    console.log('Session created:', res);
    return { session_id: res.id as string, message: 'Session started successfully' };
  } catch (error: any) {
    console.error('Error creating session:', error);
    
    // Enhanced error handling for auth failures
    if (error?.message?.includes?.('Authentication required')) {
      const errorMessage = 'Authentication session expired. Please refresh the page and try again.';
      console.error('Auth error detected:', errorMessage);
      throw new Error(errorMessage);
    }
    
    // Handle Convex errors with more context
    if (error?.name === 'ConvexError') {
      const enhancedMessage = `Session creation failed: ${error.message || 'Unknown Convex error'}`;
      console.error('Convex error:', enhancedMessage);
      throw new Error(enhancedMessage);
    }
    
    throw error;
  }
};

export const listUserSessions = async (options?: {
  folderId?: string;
  limit?: number;
  includeEnded?: boolean;
  sortBy?: 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}, convexClient?: ConvexReactClient) => {
  const convex = convexClient || fallbackConvex;
  
  try {
    console.log('Fetching user sessions...');
    const sessions = await convex.query(convexApi.functions.listUserSessions, {
      folderId: options?.folderId as Id<"folders"> | undefined,
      limit: options?.limit || 50,
      includeEnded: options?.includeEnded,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder
    });
    console.log('Sessions fetched:', sessions);
    return sessions;
  } catch (error) {
    console.error('Error fetching sessions:', error);
    throw error;
  }
};

export const updateSessionContext = async (
  sessionId: string, 
  context: any, 
  options?: {
    expectedVersion?: number;
    merge?: boolean;
  },
  convexClient?: ConvexReactClient
) => {
  const convex = convexClient || fallbackConvex;
  
  try {
    console.log('Updating session context...');
    const result = await convex.mutation(convexApi.functions.updateSessionContext, {
      sessionId: sessionId as Id<"sessions">,
      context,
      expectedVersion: options?.expectedVersion,
      merge: options?.merge ?? true
    });
    console.log('Context update result:', result);
    return result;
  } catch (error) {
    console.error('Error updating session context:', error);
    throw error;
  }
};

export const deleteSession = async (sessionId: string, options?: {
  deleteRelatedData?: boolean;
}, convexClient?: ConvexReactClient) => {
  const convex = convexClient || fallbackConvex;
  
  try {
    console.log('Deleting session...');
    const result = await convex.mutation(convexApi.functions.deleteSession, {
      sessionId: sessionId as Id<"sessions">
    });
    console.log('Session deletion result:', result);
    return result;
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
};

// --- Document Upload ---

export const uploadDocuments = async (
  sessionId: string,
  files: File[],
  convexClient?: ConvexReactClient
): Promise<UploadDocumentsResponse> => {
  const convex = convexClient || fallbackConvex;
  
  if (files.length === 0) {
    return {
      vector_store_id: null,
      files_received: [],
      analysis_status: 'completed',
      message: "No files selected for upload.",
    };
  }

  console.log(`[API] Uploading ${files.length} files to session ${sessionId}...`);
  
  try {
    const uploadedFiles: any[] = [];
    
    for (const file of files) {
      console.log(`Uploading file: ${file.name} (${file.size} bytes)`);
      
      // Step 1: Generate upload URL
      const uploadUrl = await convex.mutation(convexApi.functions.generateUploadUrl, {});
      
      // Step 2: Upload file to Convex storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload ${file.name}: ${uploadResponse.statusText}`);
      }
      
      const { storageId } = await uploadResponse.json();
      
      // Step 3: Store file metadata in database
      const fileId = await convex.mutation(convexApi.functions.storeFileMetadata, {
        sessionId: sessionId as Id<"sessions">,
        storageId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      
      uploadedFiles.push({
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
      });
      
      console.log(`Successfully uploaded: ${file.name}`);
    }
    
    return {
      vector_store_id: `session_${sessionId}`, // Placeholder vector store ID
      files_received: uploadedFiles,
      analysis_status: 'completed',
      message: `Successfully uploaded ${uploadedFiles.length} file(s).`,
    };
    
  } catch (error) {
    console.error('Error uploading files:', error);
    throw error;
  }
};

// --- Generation Steps ---

export const triggerPlanGeneration = async (sessionId: string): Promise<{ message: string }> => {
  try {
    console.log(`Triggering lesson plan generation for session ${sessionId}...`);
    const response = await apiClient.post<{ message: string }>(`/sessions/${sessionId}/plan`);
    console.log('Plan generation triggered:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error triggering plan generation:', error);
    throw error;
  }
};

// +++ NEW Interaction Endpoint +++
export const interactWithTutor = async (sessionId: string, interactionData: InteractionRequestData): Promise<InteractionResponseData> => {
    try {
        console.log(`Sending interaction to session ${sessionId}:`, interactionData);
        const response = await apiClient.post<InteractionResponseData>(
            `/sessions/${sessionId}/interact`,
            interactionData
        );
        console.log('Interaction response received:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error interacting with tutor:', error);
        throw error;
    }
};

// --- Session Analysis (Optional) ---

export const triggerSessionAnalysis = async (sessionId: string): Promise<{ message: string }> => {
    try {
        console.log(`Triggering session analysis for session ${sessionId}...`);
        const response = await apiClient.post<{ message: string }>(`/sessions/${sessionId}/analyze-session`);
        console.log('Session analysis triggered:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error triggering session analysis:', error);
        throw error;
    }
};

export const getSessionAnalysis = async (sessionId: string): Promise<SessionAnalysis> => {
  try {
    console.log(`Fetching session analysis for session ${sessionId}...`);
    const response = await apiClient.get<SessionAnalysis>(`/sessions/${sessionId}/analysis`);
    console.log('Session analysis fetched:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching session analysis:', error);
    throw error;
  }
};

// --- Mini-Quiz/Summary Logging (Optional) ---

export const logMiniQuizAttempt = async (sessionId: string, attemptData: any): Promise<void> => {
    try {
        console.log(`Logging mini-quiz attempt for session ${sessionId}...`);
        await apiClient.post(`/sessions/${sessionId}/log/mini-quiz`, attemptData);
        console.log('Mini-quiz attempt logged.');
    } catch (error) {
        console.error('Error logging mini-quiz attempt:', error);
    }
};

export const logUserSummary = async (sessionId: string, summaryData: any): Promise<void> => {
    try {
        console.log(`Logging user summary for session ${sessionId}...`);
        await apiClient.post(`/sessions/${sessionId}/log/summary`, summaryData);
        console.log('User summary logged.');
    } catch (error) {
        console.error('Error logging user summary:', error);
    }
};

// --- Folder Management API Calls ---

export const createFolder = async (
    folderData: FolderCreateRequest & {
        metadata?: {
            tags?: string[];
            subject?: string;
            difficulty?: 'beginner' | 'intermediate' | 'advanced';
        };
    },
    convexClient?: ConvexReactClient
): Promise<FolderResponse> => {
    const convex = convexClient || fallbackConvex;
    
    try {
        console.log('Creating new folder via Convex:', folderData.name);
        const folder = await convex.mutation(convexApi.functions.createFolder, { 
            name: folderData.name,
            metadata: folderData.metadata
        });
        console.log('Folder created:', folder);
        return {
            id: folder.id as string,
            name: folderData.name,
            created_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error('Error creating folder:', error);
        throw error;
    }
};

export const getFolders = async (
    options?: {
        search?: string;
        limit?: number;
        includeStats?: boolean;
        sortBy?: 'name' | 'created_at' | 'updated_at';
        sortOrder?: 'asc' | 'desc';
    },
    convexClient?: ConvexReactClient
): Promise<FolderResponse[]> => {
    const convex = convexClient || fallbackConvex;
    
    try {
        console.log('Fetching folders via Convex...');
        const result = await convex.query(convexApi.functions.listFoldersEnhanced, options || {});
        console.log('Folders fetched:', result);
        
        return result.folders.map((folder: any) => ({
            id: folder._id,
            name: folder.name,
            created_at: new Date(folder.created_at).toISOString(),
            stats: folder.stats,
        }));
    } catch (error) {
        console.error('Error fetching folders:', error);
        // Fallback to basic folder listing
        try {
            console.log('Falling back to basic folder listing...');
            const result = await convex.query(convexApi.functions.listFolders, {});
            return result.folders.map((folder: any) => ({
                id: folder._id as string,
                name: folder.name,
                created_at: new Date(folder.created_at).toISOString(),
            }));
        } catch (fallbackError) {
            console.error('Both enhanced and basic folder listing failed:', fallbackError);
            return [];
        }
    }
};

export const getFolderStats = async (folderId?: string, convexClient?: ConvexReactClient) => {
    const convex = convexClient || fallbackConvex;
    
    try {
        console.log('Fetching folder statistics...');
        const stats = await convex.query(convexApi.functions.getFolderStats, 
            folderId ? { folderId: folderId as Id<"folders"> } : {}
        );
        console.log('Folder stats fetched:', stats);
        return stats;
    } catch (error) {
        console.error('Error fetching folder stats:', error);
        throw error;
    }
};

export const deleteFolder = async (
    folderId: string, 
    options?: {
        deleteRelatedData?: boolean;
        reassignSessionsTo?: string;
    },
    convexClient?: ConvexReactClient
) => {
    const convex = convexClient || fallbackConvex;
    
    try {
        console.log('Deleting folder...');
        const result = await convex.mutation(convexApi.functions.deleteFolder, {
            folderId: folderId as Id<"folders">,
            deleteRelatedData: options?.deleteRelatedData ?? false,
            reassignSessionsTo: options?.reassignSessionsTo as Id<"folders"> | undefined
        });
        console.log('Folder deletion result:', result);
        return result;
    } catch (error) {
        console.error('Error deleting folder:', error);
        throw error;
    }
};

export const renameFolder = async (folderId: string, name: string, convexClient?: ConvexReactClient) => {
    const convex = convexClient || fallbackConvex;
    
    try {
        console.log('Renaming folder...');
        const result = await convex.mutation(convexApi.functions.renameFolder, {
            folderId: folderId as Id<"folders">,
            name
        });
        console.log('Folder rename result:', result);
        return result;
    } catch (error) {
        console.error('Error renaming folder:', error);
        throw error;
    }
};

// --- Plan Generation (Plan-First) ---
export const generatePlan = async (sessionId: string): Promise<import('./types').FocusObjective> => {
  try {
    console.log(`Generating plan for session ${sessionId}...`);
    const response = await apiClient.post<import('./types').FocusObjective>(
      `/sessions/${sessionId}/plan`
    );
    console.log('Plan generated:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error generating plan:', error);
    throw error;
  }
};

// +++ Front-end "interact" helper +++
export async function sendInteraction(
  sessionId: string,
  type: 'start' | 'next' | 'answer' | 'summary' | 'previous',
  data?: Record<string, any>
): Promise<InteractionResponseData> {
  try {
    const response = await apiClient.post<InteractionResponseData>(
      `/sessions/${sessionId}/interact`,
      { type, data }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending interaction:', error);
    throw error;
  }
}

// --- Fetch historical chat messages ---
export interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  interaction?: any;
  whiteboard_actions?: any[];
  whiteboard_snapshot_index?: number;
}

export async function fetchSessionMessages(sessionId: string, beforeMessageId?: string, limit: number = 30, convexClient?: ConvexReactClient): Promise<ChatHistoryMessage[]> {
  const convex = convexClient || fallbackConvex;
  
  try {
      console.log('Fetching session messages via Convex...');
      const messages = await convex.query(convexApi.functions.getSessionMessages, { 
        sessionId: sessionId as Id<"sessions"> 
      });
      
      // Transform the messages to match the expected interface
      return messages.map((message: any) => ({
        id: message._id,
        role: message.role || 'assistant',
        content: message.content || '',
        interaction: message.interaction,
        whiteboard_actions: message.whiteboard_actions,
        whiteboard_snapshot_index: message.whiteboard_snapshot_index,
      }));
  } catch (error) {
      console.error('Error fetching session messages via Convex:', error);
      throw error;
  }
}
