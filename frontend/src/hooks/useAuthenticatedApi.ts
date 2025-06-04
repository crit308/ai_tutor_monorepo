'use client';

import { useCallback } from 'react';
import { useConvex } from 'convex/react';
import * as api from '@/lib/api';
import { FolderResponse } from '@/lib/types';
import { api as convexApi } from 'convex_generated/api';

export function useAuthenticatedApi() {
  const convex = useConvex();

  const debugAuth = useCallback(async () => {
    try {
      const result = await convex.query(convexApi.functions.debugAuth, {});
      console.log('Auth debug result:', result);
      return result;
    } catch (error) {
      console.error('Auth debug error:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [convex]);

  const getFolders = useCallback(async (options?: {
    search?: string;
    limit?: number;
    includeStats?: boolean;
    sortBy?: 'name' | 'created_at' | 'updated_at';
    sortOrder?: 'asc' | 'desc';
  }): Promise<FolderResponse[]> => {
    return api.getFolders(options, convex);
  }, [convex]);

  const createFolder = useCallback(async (
    folderData: { name: string; metadata?: any }
  ): Promise<FolderResponse> => {
    return api.createFolder(folderData, convex);
  }, [convex]);

  const getFolderStats = useCallback(async (folderId?: string) => {
    return api.getFolderStats(folderId, convex);
  }, [convex]);

  const deleteFolder = useCallback(async (
    folderId: string, 
    options?: { deleteRelatedData?: boolean; reassignSessionsTo?: string; }
  ) => {
    return api.deleteFolder(folderId, options, convex);
  }, [convex]);

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    return api.renameFolder(folderId, name, convex);
  }, [convex]);

  const startSession = useCallback(async (folderId: string, metadata?: any) => {
    // Pre-validate authentication state
    console.log('Starting session with authenticated API...');
    
    try {
      // Check auth first
      const authCheck = await debugAuth();
      console.log('Auth check before session creation:', authCheck);
      
      if (!authCheck.isAuthenticated) {
        throw new Error(`Authentication failed: ${authCheck.error || 'Not authenticated'}`);
      }
      
      return await api.startSession(folderId, metadata, convex);
    } catch (error) {
      console.error('Session creation failed in authenticated API:', error);
      throw error;
    }
  }, [convex, debugAuth]);

  const uploadDocuments = useCallback(async (sessionId: string, files: File[]) => {
    console.log('Uploading documents with authenticated API...');
    
    try {
      // Check auth first
      const authCheck = await debugAuth();
      console.log('Auth check before file upload:', authCheck);
      
      if (!authCheck.isAuthenticated) {
        throw new Error(`Authentication failed: ${authCheck.error || 'Not authenticated'}`);
      }
      
      return await api.uploadDocuments(sessionId, files, convex);
    } catch (error) {
      console.error('File upload failed in authenticated API:', error);
      throw error;
    }
  }, [convex, debugAuth]);

  const listUserSessions = useCallback(async (options?: any) => {
    return api.listUserSessions(options, convex);
  }, [convex]);

  const updateSessionContext = useCallback(async (
    sessionId: string, 
    context: any, 
    options?: any
  ) => {
    return api.updateSessionContext(sessionId, context, options, convex);
  }, [convex]);

  const deleteSession = useCallback(async (
    sessionId: string, 
    options?: { deleteRelatedData?: boolean; }
  ) => {
    return api.deleteSession(sessionId, options, convex);
  }, [convex]);

  const fetchSessionMessages = useCallback(async (
    sessionId: string, 
    beforeMessageId?: string, 
    limit: number = 30
  ) => {
    return api.fetchSessionMessages(sessionId, beforeMessageId, limit, convex);
  }, [convex]);

  return {
    debugAuth,
    getFolders,
    createFolder,
    getFolderStats,
    deleteFolder,
    renameFolder,
    startSession,
    uploadDocuments,
    listUserSessions,
    updateSessionContext,
    deleteSession,
    fetchSessionMessages,
  };
} 