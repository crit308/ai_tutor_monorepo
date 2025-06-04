'use client';

import { useCallback } from 'react';
import { useConvex } from 'convex/react';
import * as api from '@/lib/api';
import { FolderResponse } from '@/lib/types';

export function useAuthenticatedApi() {
  const convex = useConvex();

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
    return api.startSession(folderId, metadata, convex);
  }, [convex]);

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
    getFolders,
    createFolder,
    getFolderStats,
    deleteFolder,
    renameFolder,
    startSession,
    listUserSessions,
    updateSessionContext,
    deleteSession,
    fetchSessionMessages,
  };
} 