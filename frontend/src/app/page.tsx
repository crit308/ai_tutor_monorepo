'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SessionState, useSessionStore } from '@/store/sessionStore';
import { shallow } from 'zustand/shallow';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import AuthForm from '@/components/AuthForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from "@/components/ui/use-toast";
import { FolderPlus, Folder as FolderIcon, UploadCloud } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { FolderResponse } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import type { StructuredError } from '@/store/sessionStore';

// Define props type for FolderList
interface FolderListProps {
  folders: FolderResponse[];
  selectedFolderId: string | null;
  loadingState: SessionState['loadingState'];
  onSelect: (folderId: string | null) => void;
  onDeselect: () => void;
}

// Memoized folder list component to avoid rerenders on auth events
const FolderList = React.memo(({ folders, selectedFolderId, loadingState, onSelect, onDeselect }: FolderListProps) => (
  <div>
    <Label htmlFor="folder-select">Select Folder</Label>
    <div className="flex items-center gap-2 mt-1">
      <select
        id="folder-select"
        value={selectedFolderId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="flex-grow p-2 border rounded-md bg-background disabled:opacity-50"
        disabled={!folders || folders.length === 0 || loadingState === 'loading' || loadingState === 'interacting'}
      >
        <option value="" disabled>-- Select a folder --</option>
        {folders.map((folder: FolderResponse) => (
          <option key={folder.id} value={folder.id}>{folder.name}</option>
        ))}
      </select>
      <Button variant="outline" size="icon" onClick={onDeselect} title="Deselect Folder" disabled={!selectedFolderId || loadingState === 'loading' || loadingState === 'interacting'}>
        <FolderIcon className="h-4 w-4" />
      </Button>
    </div>
    {folders && folders.length === 0 && (
      <p className="text-xs text-muted-foreground mt-1">No folders found. Create one below.</p>
    )}
  </div>
));

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folders, setFolders] = useState<FolderResponse[] | null>(null);
  const selectedFolderId = useSessionStore((state) => state.folderId);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [pageLoading, setPageLoading] = useState(true);

  const loadingState = useSessionStore((state) => state.loadingState);
  const loadingMessage = useSessionStore((state) => state.loadingMessage);
  const error = useSessionStore((state) => state.error);
  const setLoading = useSessionStore((state) => state.setLoading);
  const setSessionId = useSessionStore((state) => state.setSessionId);
  const setVectorStoreId = useSessionStore((state) => state.setVectorStoreId);
  const setSelectedFolderId = useSessionStore((state) => state.setSelectedFolderId);
  const setError = useSessionStore((state) => state.setError);
  const resetSession = useSessionStore((state) => state.resetSession);
  const setLoadingMessage = useSessionStore((state) => state.setLoadingMessage);

  useEffect(() => {
    if (authLoading) {
      setPageLoading(true);
      return;
    }

    if (user) {
      setPageLoading(true);
      setFolders(null);
      api.getFolders()
        .then(fetchedFolders => {
          setFolders(fetchedFolders);
          if (selectedFolderId && !fetchedFolders.some(f => f.id === selectedFolderId)) {
            setSelectedFolderId(null);
          }
        })
        .catch(err => {
          console.error("Failed to fetch folders:", err);
          toast({ title: "Error", description: "Could not fetch your folders.", variant: "destructive" });
          setFolders([]);
        })
        .finally(() => setPageLoading(false));
    } else {
      setFolders(null);
      setPageLoading(false);
    }
  }, [user, authLoading, toast, setSelectedFolderId]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
    }
  };

  const handleStartLearning = useCallback(async (isNewFolder: boolean = false) => {
    if (!user) {
      toast({ title: "Not Authenticated", description: "Please log in to start a session.", variant: "destructive" });
      return;
    }
    if (!selectedFolderId) {
      toast({ title: "No Folder Selected", description: "Please select or create a folder first.", variant: "destructive" });
      return;
    }
    if (isNewFolder && selectedFiles.length === 0) {
      toast({ title: "No files selected", description: "Please select documents to upload.", variant: "destructive" });
      return;
    }

    setLoading('loading');
    resetSession();
    setSelectedFolderId(selectedFolderId);
    setLoadingMessage('Starting session...');
    setError(null);

    try {
      console.log(`Starting session for ${isNewFolder ? 'new' : 'existing'} folder: ${selectedFolderId}`);
      const sessionResponse = await api.startSession(selectedFolderId);
      const currentSessionId = sessionResponse.session_id;
      setSessionId(currentSessionId);
      console.log(`Session started with ID: ${currentSessionId}`);

      if (isNewFolder || selectedFiles.length > 0) {
        if (selectedFiles.length === 0) {
          throw new Error("Internal logic error: Files required for new folder but none selected.");
        }
        setLoading('loading');
        setLoadingMessage(`Uploading ${selectedFiles.length} document(s) for session ${currentSessionId}...`);
        console.log(`Uploading ${selectedFiles.length} files for session ${currentSessionId}...`);
        const uploadResponse = await api.uploadDocuments(currentSessionId, selectedFiles);

        console.log('Upload response:', uploadResponse);

        if (!uploadResponse) {
          throw new Error('No response received from server during upload.');
        }

        if (uploadResponse.vector_store_id) {
          setVectorStoreId(uploadResponse.vector_store_id);
        }

        toast({ title: "Upload Successful", description: `${uploadResponse.files_received.length} file(s) processed.` });
        setSelectedFiles([]);
      } else {
        console.log("Skipping document upload for existing folder.");
      }

      setLoading('success');
      setLoadingMessage('Preparation complete!');
      toast({ title: "Ready!", description: "Navigating to learning session..." });

      router.push(`/session/${sessionResponse.session_id}/learn`);

    } catch (error: any) {
      console.error("Upload failed:", error);
      const errorMessage = error.response?.data?.detail || error.message || 'An unknown error occurred during upload.';
      const finalMessage = error.response?.status === 401 ? "Authentication failed. Please check your API key." : errorMessage;
      setError({ message: `Upload failed: ${finalMessage}` });
      setLoading('error');
      setLoadingMessage('An error occurred.');
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
    }
  }, [user, selectedFolderId, selectedFiles, router, setLoading, setSessionId, setVectorStoreId, setSelectedFolderId, setError, toast, setLoadingMessage, resetSession]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast({ title: "Folder name required", variant: "destructive" });
      return;
    }
    setIsCreatingFolder(true);
    try {
      const newFolder = await api.createFolder({ name: newFolderName });
      setFolders(prev => prev ? [newFolder, ...prev] : [newFolder]);
      setSelectedFolderId(newFolder.id);
      setNewFolderName('');
      toast({ title: "Folder Created", description: `"${newFolder.name}" created successfully.` });
    } catch (error: any) {
      console.error("Folder creation failed:", error);
      toast({ title: "Folder Creation Failed", description: error.message || "Could not create folder.", variant: "destructive" });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSelectedFiles([]);
  };

  if (authLoading) {
    return <LoadingSpinner message="Loading user data..." />;
  }

  return (
    <div className="flex justify-center items-center min-h-screen">
      {!user ? (
        <AuthForm />
      ) : (
        pageLoading ? (
          <LoadingSpinner message="Loading folders..." />
        ) : (
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>AI Tutor Dashboard</CardTitle>
              <CardDescription>Select a folder and upload documents to begin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FolderList
                folders={folders || []}
                selectedFolderId={selectedFolderId}
                loadingState={loadingState}
                onSelect={handleSelectFolder}
                onDeselect={() => handleSelectFolder(null)}
              />

              <form onSubmit={handleCreateFolder} className="space-y-2">
                <Label htmlFor="new-folder-name">Create New Folder</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-folder-name"
                    placeholder="Enter folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    disabled={isCreatingFolder || loadingState === 'loading' || loadingState === 'interacting'}
                  />
                  <Button type="submit" disabled={!newFolderName.trim() || isCreatingFolder || loadingState === 'loading' || loadingState === 'interacting'}>
                    {isCreatingFolder ? <LoadingSpinner size={16} /> : <FolderPlus className="h-4 w-4" />}
                  </Button>
                </div>
              </form>

              <Separator />

              {selectedFolderId && (
                <div className="space-y-2">
                  <Label htmlFor="documents">Upload Documents (Required for new folders)</Label>
                  <Input
                    id="documents"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md"
                    onChange={handleFileChange}
                    disabled={!selectedFolderId || loadingState === 'loading' || loadingState === 'interacting'}
                    className="cursor-pointer file:cursor-pointer"
                  />
                  {selectedFiles.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {selectedFiles.map((file, index) => <li key={index}>{file.name}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {loadingState !== 'idle' && loadingState !== 'success' && (
                <LoadingSpinner message={loadingMessage} />
              )}
              {error && (
                <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded-md">
                  <p><strong>Error:</strong> {typeof error === 'object' && error !== null && error.message ? error.message : 'An unknown error occurred'}</p>
                  {typeof error === 'object' && error !== null && error.code && <p>Code: {error.code}</p>}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => handleStartLearning(selectedFiles.length > 0)}
                disabled={!selectedFolderId || loadingState === 'loading' || loadingState === 'interacting'}
                className="w-full"
              >
                {loadingState === 'loading' || loadingState === 'interacting' ? 'Processing...' : (selectedFiles.length > 0 ? <><UploadCloud className="mr-2 h-4 w-4" /> Upload & Start</> : 'Start Learning with Existing Docs')}
              </Button>
            </CardFooter>
          </Card>
        )
      )}
    </div>
  );
}
