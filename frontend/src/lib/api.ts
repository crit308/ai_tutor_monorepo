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
import { convex } from './convex';
import { api as convexApi } from '../../convex/_generated/api';

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

export const startSession = async (folderId: string, metadata?: {
  clientVersion?: string;
  userAgent?: string;
  timezone?: string;
}): Promise<StartSessionResponse> => {
  try {
    console.log(`Creating new session for folder ${folderId} via enhanced Convex...`);
    
    // Use the enhanced createSession function
    const res = await convex.mutation(convexApi.functions.createSessionEnhanced, { 
      folderId,
      metadata: {
        clientVersion: "2.0.0",
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...metadata
      }
    });
    
    console.log('Enhanced session created:', res);
    return { session_id: res.id as string, message: 'Session started with enhanced features' };
  } catch (error) {
    console.error('Error creating enhanced session:', error);
    
    // Fallback to basic session creation if enhanced fails
    try {
      console.log('Falling back to basic session creation...');
      const res = await convex.mutation(convexApi.functions.startSession, { folderId });
      return { session_id: res.id as string, message: 'Session started (basic)' };
    } catch (fallbackError) {
      console.error('Both enhanced and basic session creation failed:', fallbackError);
      throw fallbackError;
    }
  }
};

// Enhanced session listing
export const listUserSessions = async (options?: {
  folderId?: string;
  limit?: number;
  includeEnded?: boolean;
  sortBy?: 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}) => {
  try {
    console.log('Fetching user sessions with enhanced options...');
    const sessions = await convex.query(convexApi.functions.listUserSessionsEnhanced, options || {});
    console.log('Enhanced sessions fetched:', sessions);
    return sessions;
  } catch (error) {
    console.error('Error fetching enhanced sessions:', error);
    
    // Fallback to basic session listing
    try {
      console.log('Falling back to basic session listing...');
      const sessions = await convex.query(convexApi.functions.listUserSessions, { 
        userId: 'current', // This will be handled by auth
        limit: options?.limit || 50 
      });
      return { sessions: sessions.sessions };
    } catch (fallbackError) {
      console.error('Both enhanced and basic session listing failed:', fallbackError);
      throw fallbackError;
    }
  }
};

// Enhanced session context management
export const updateSessionContext = async (
  sessionId: string, 
  context: any, 
  options?: {
    expectedVersion?: number;
    merge?: boolean;
  }
) => {
  try {
    console.log('Updating session context with enhanced features...');
    const result = await convex.mutation(convexApi.functions.updateSessionContextEnhanced, {
      sessionId,
      context,
      expectedVersion: options?.expectedVersion,
      merge: options?.merge ?? true
    });
    console.log('Enhanced context update result:', result);
    return result;
  } catch (error) {
    console.error('Error updating enhanced session context:', error);
    
    // Fallback to basic context update
    try {
      console.log('Falling back to basic context update...');
      await convex.mutation(convexApi.functions.updateSessionContext, { sessionId, context });
      return { success: true };
    } catch (fallbackError) {
      console.error('Both enhanced and basic context update failed:', fallbackError);
      throw fallbackError;
    }
  }
};

// Enhanced session deletion
export const deleteSession = async (sessionId: string, options?: {
  deleteRelatedData?: boolean;
}) => {
  try {
    console.log('Deleting session with enhanced cleanup...');
    const result = await convex.mutation(convexApi.functions.deleteSessionEnhanced, {
      sessionId,
      deleteRelatedData: options?.deleteRelatedData ?? true
    });
    console.log('Enhanced session deletion result:', result);
    return result;
  } catch (error) {
    console.error('Error with enhanced session deletion:', error);
    throw error;
  }
};

// --- Document Upload ---

// Add function to get upload URL from Convex
export const generateFileUploadUrl = async (): Promise<string> => {
  try {
    const uploadUrl = await convex.mutation(convexApi.functions.generateFileUploadUrl);
    if (!uploadUrl) {
      throw new Error("Failed to get an upload URL from Convex.");
    }
    return uploadUrl;
  } catch (error) {
    console.error('Error generating file upload URL:', error);
    throw error;
  }
};

export const uploadDocuments = async (
  sessionId: string,
  files: File[],
): Promise<UploadDocumentsResponse> => {
  if (files.length === 0) {
    return {
      vector_store_id: null,
      files_received: [],
      analysis_status: 'completed',
      message: "No files selected for upload.",
    };
  }

  console.log(`[API] Starting upload process for ${files.length} files to session ${sessionId}`);

  const uploadedFileInfos: Array<{ storageId: string; filename: string; mimeType: string }> = [];

  for (const file of files) {
    try {
      console.log(`[API] Requesting upload URL for ${file.name}`);
      const postUrl = await generateFileUploadUrl();
      console.log(`[API] Upload URL received for ${file.name}. Posting file...`);

      const uploadResult = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadResult.ok) {
        throw new Error(`Failed to upload ${file.name} directly to Convex storage. Status: ${uploadResult.status} ${uploadResult.statusText}`);
      }

      const { storageId } = await uploadResult.json(); // Convex returns { storageId: Id<"_storage"> }
      console.log(`[API] File ${file.name} uploaded to Convex storage. Storage ID: ${storageId}`);
      uploadedFileInfos.push({ storageId, filename: file.name, mimeType: file.type });
    } catch (error) {
      console.error(`[API] Error uploading file ${file.name}:`, error);
      // Stop the batch if one file fails direct upload
      throw new Error(`Failed to upload ${file.name} to Convex storage: ${(error as Error).message}`);
    }
  }

  // All files uploaded to Convex storage, now trigger backend processing action
  try {
    console.log(`[API] All files uploaded to Convex storage. Triggering backend processing for session ${sessionId}.`);
    const processingResponse = await convex.action(convexApi.functions.processUploadedFilesForSession, {
      sessionId,
      uploadedFileInfos,
    });
    console.log('[API] Backend processing response:', processingResponse);
    // The action should return an UploadDocumentsResponse compatible structure
    return processingResponse as UploadDocumentsResponse;
  } catch (error) {
    console.error('[API] Error triggering backend file processing action:', error);
    throw error; // Re-throw to be caught by the UI
  }
};

// --- Generation Steps ---
// Note: The frontend reqs imply these might be fire-and-forget,
// or you might need status endpoints depending on backend design.
// Keep /plan trigger for initial setup after analysis
// Renamed for clarity
/*
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
*/

/* Removed - Orchestrator handles content flow
export const triggerContentGeneration = async (sessionId: string): Promise<{ message: string }> => {
  try {
    console.log(`Triggering lesson content generation for session ${sessionId}...`);
    const response = await apiClient.post<{ message: string }>(`/sessions/${sessionId}/content`);
    console.log('Content generation triggered:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error triggering content generation:', error);
    throw error;
  }
};
*/

// --- Data Fetching ---

// Keep getLessonPlan if needed for initial display or context, but less critical now
/*
export const getLessonPlan = async (sessionId: string): Promise<LessonPlan> => {
  try {
    console.log(`Fetching lesson plan for session ${sessionId}...`);
    const response = await apiClient.get<LessonPlan>(`/sessions/${sessionId}/plan`);
    console.log('Lesson plan fetched:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching lesson plan:', error);
    throw error;
  }
};
*/

// Remove getLessonContent - content comes via /interact
/*
export const getLessonContent = async (sessionId: string): Promise<LessonContent> => {
  try {
    console.log(`Fetching lesson content for session ${sessionId}...`);
    const response = await apiClient.get<LessonContent>(`/sessions/${sessionId}/lesson`);
    console.log('Lesson content fetched:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching lesson content:', error);
    throw error;
  }
};
*/

// Remove getQuiz - quiz questions come via /interact
/*
export const getQuiz = async (sessionId: string): Promise<Quiz> => {
  try {
    console.log(`Fetching quiz for session ${sessionId}...`);
    const response = await apiClient.get<Quiz>(`/sessions/${sessionId}/quiz`);
    console.log('Quiz fetched:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching quiz:', error);
    throw error;
  }
};
*/

// --- Quiz Submission & Feedback ---
// Remove submitQuiz - answers are sent via /interact
/*
export const submitQuiz = async (sessionId: string, answers: QuizUserAnswers): Promise<QuizFeedback> => {
  try {
    console.log(`Submitting quiz answers for session ${sessionId}...`);
    const response = await apiClient.post<QuizFeedback>(`/sessions/${sessionId}/quiz/submit`, answers);
    console.log('Quiz feedback received:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error submitting quiz:', error);
    throw error;
  }
};
*/

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
// Define endpoints if your backend supports logging these interactions

export const logMiniQuizAttempt = async (sessionId: string, attemptData: any): Promise<void> => {
    try {
        console.log(`Logging mini-quiz attempt for session ${sessionId}...`);
        await apiClient.post(`/sessions/${sessionId}/log/mini-quiz`, attemptData);
        console.log('Mini-quiz attempt logged.');
    } catch (error) {
        console.error('Error logging mini-quiz attempt:', error);
        // Decide if this error should propagate or be silently handled
    }
};

export const logUserSummary = async (sessionId: string, summaryData: any): Promise<void> => {
    try {
        console.log(`Logging user summary for session ${sessionId}...`);
        await apiClient.post(`/sessions/${sessionId}/log/summary`, summaryData);
        console.log('User summary logged.');
    } catch (error) {
        console.error('Error logging user summary:', error);
        // Decide if this error should propagate or be silently handled
    }
};

// --- Folder Management API Calls ---

// Enhanced Folder Management
export const createFolder = async (
    folderData: FolderCreateRequest & {
        metadata?: {
            tags?: string[];
            subject?: string;
            difficulty?: 'beginner' | 'intermediate' | 'advanced';
        };
    }
): Promise<FolderResponse> => {
    try {
        console.log('Creating new folder via enhanced Convex:', folderData.name);
        const folder = await convex.mutation(convexApi.functions.createFolderEnhanced, { 
            name: folderData.name,
            metadata: folderData.metadata
        });
        console.log('Enhanced folder created:', folder);
        return {
            id: folder.id,
            name: folder.name,
            created_at: new Date(folder.created_at).toISOString(),
        };
    } catch (error) {
        console.error('Error creating enhanced folder:', error);
        
        // Fallback to basic folder creation
        try {
            console.log('Falling back to basic folder creation...');
            const folder = await convex.mutation(convexApi.functions.createFolder, { name: folderData.name });
            return {
                id: folder._id as string,
                name: folder.name,
                created_at: new Date(folder.created_at).toISOString(),
            };
        } catch (fallbackError) {
            console.error('Both enhanced and basic folder creation failed:', fallbackError);
            throw fallbackError;
        }
    }
};

export const getFolders = async (options?: {
    search?: string;
    limit?: number;
    includeStats?: boolean;
    sortBy?: 'name' | 'created_at' | 'updated_at';
    sortOrder?: 'asc' | 'desc';
}): Promise<FolderResponse[]> => {
    try {
        console.log('Fetching folders via enhanced Convex...');
        const result = await convex.query(convexApi.functions.listFoldersEnhanced, options || {});
        console.log('Enhanced folders fetched:', result);
        
        return result.folders.map((folder: any) => ({
            id: folder._id,
            name: folder.name,
            created_at: new Date(folder.created_at).toISOString(),
            stats: folder.stats,
        }));
    } catch (error) {
        console.error('Error fetching enhanced folders:', error);
        
        // Fallback to basic folder listing
        try {
            console.log('Falling back to basic folder listing...');
            const folders = await convex.query(convexApi.functions.listFolders, {});
            return folders.map(folder => ({
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

// Enhanced folder operations
export const getFolderStats = async (folderId?: string) => {
    try {
        console.log('Fetching folder statistics...');
        const stats = await convex.query(convexApi.functions.getFolderStats, folderId ? { folderId } : {});
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
    }
) => {
    try {
        console.log('Deleting folder with enhanced cleanup...');
        const result = await convex.mutation(convexApi.functions.deleteFolderEnhanced, {
            folderId,
            deleteRelatedData: options?.deleteRelatedData ?? false,
            reassignSessionsTo: options?.reassignSessionsTo
        });
        console.log('Enhanced folder deletion result:', result);
        return result;
    } catch (error) {
        console.error('Error with enhanced folder deletion:', error);
        throw error;
    }
};

export const renameFolder = async (folderId: string, name: string) => {
    try {
        console.log('Renaming folder with enhanced validation...');
        const result = await convex.mutation(convexApi.functions.renameFolderEnhanced, {
            folderId,
            name
        });
        console.log('Enhanced folder rename result:', result);
        return result;
    } catch (error) {
        console.error('Error with enhanced folder rename:', error);
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

export async function fetchSessionMessages(sessionId: string, beforeMessageId?: string, limit: number = 30): Promise<ChatHistoryMessage[]> {
  try {
      console.log('Fetching session messages via Convex...');
      return await convex.query(convexApi.functions.getSessionMessages, { sessionId });
  } catch (error) {
      console.error('Error fetching session messages via Convex:', error);
      throw error;
  }
}
