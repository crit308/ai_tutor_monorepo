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
import { supabase } from './supabaseClient'; // Import Supabase client

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'; // Use environment variable

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Axios interceptor to add Auth token ---
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
    console.log("Attaching Supabase token to request to:", config.url); // Debug log
  } else {
    console.log("No Supabase session found, request sent without token to:", config.url); // Debug log
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

export const startSession = async (folderId: string): Promise<StartSessionResponse> => {
  try {
    console.log(`Starting new session for folder ${folderId}...`);
    const response = await apiClient.post<StartSessionResponse>(
        '/sessions',
        { folder_id: folderId } // Pass folder_id in the request body (ensure backend expects this)
    );
    console.log('Session started:', response.data.session_id);
    return response.data;
  } catch (error) {
    console.error('Error starting session:', error);
    throw error; // Re-throw for handling in UI
  }
};

// --- Document Upload ---

export const uploadDocuments = async (sessionId: string, files: File[]): Promise<UploadDocumentsResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file); // Backend expects field named 'files'
  });

  try {
    console.log(`Uploading ${files.length} documents for session ${sessionId}...`);
    const response = await apiClient.post<UploadDocumentsResponse>(
      `/sessions/${sessionId}/documents`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data', // Important for file uploads
        },
        // Optional: Add progress tracking here if needed
      }
    );
    console.log('Documents uploaded:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading documents:', error);
    throw error;
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

export const createFolder = async (folderData: FolderCreateRequest): Promise<FolderResponse> => {
    try {
        console.log('Creating new folder:', folderData.name);
        const response = await apiClient.post<FolderResponse>('/folders', folderData);
        console.log('Folder created:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error creating folder:', error);
        throw error;
    }
};

export const getFolders = async (): Promise<FolderResponse[]> => {
    try {
        console.log('Fetching folders...');
        const response = await apiClient.get<{ folders: FolderResponse[] }>('/folders');
        console.log('Folders fetched:', response.data.folders.length);
        return response.data.folders;
    } catch (error) {
        console.error('Error fetching folders:', error);
        // Return empty array or throw error based on preference
        return [];
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
      const params: any = { limit };
      if (beforeMessageId) params.before = beforeMessageId;
      const response = await apiClient.get<ChatHistoryMessage[]>(`/sessions/${sessionId}/messages`, { params });
      return response.data;
  } catch (error) {
      console.error('Error fetching session messages:', error);
      throw error;
  }
} 