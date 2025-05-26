import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SessionManager, TutorContext, UserModelState } from './sessionManager';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Enhanced SessionManager', () => {
  let sessionManager: SessionManager;
  const mockBaseUrl = 'http://localhost:4000';
  const mockAdminKey = 'test-admin-key';
  const mockUserId = 'user-123';
  const mockSessionId = 'session-456';
  const mockFolderId = 'folder-789';

  beforeEach(() => {
    sessionManager = new SessionManager(mockBaseUrl, mockAdminKey);
    (fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with default context', async () => {
      const mockResponse = { id: mockSessionId };
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const sessionId = await sessionManager.createSession(mockUserId);

      expect(sessionId).toBe(mockSessionId);
      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/createSession`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockAdminKey}`,
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining(mockUserId),
        })
      );
    });

    it('should create a session with folder data when folderId provided', async () => {
      const mockFolderData = {
        id: mockFolderId,
        name: 'Test Folder',
        vector_store_id: 'vs-123',
        knowledge_base: 'test-kb.json',
      };

      // Mock folder data fetch
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockFolderData),
        })
        // Mock session creation
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockSessionId }),
        });

      const sessionId = await sessionManager.createSession(mockUserId, mockFolderId);

      expect(sessionId).toBe(mockSessionId);
      expect(fetch).toHaveBeenCalledTimes(2); // Folder fetch + session creation
    });

    it('should handle folder fetch failure gracefully', async () => {
      // Mock folder fetch failure
      (fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Folder not found'))
        // Mock successful session creation
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockSessionId }),
        });

      const sessionId = await sessionManager.createSession(mockUserId, mockFolderId);

      expect(sessionId).toBe(mockSessionId);
    });

    it('should throw error when session creation fails', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(sessionManager.createSession(mockUserId))
        .rejects.toThrow('Failed to create session: 500 Internal Server Error');
    });
  });

  describe('getSessionContext', () => {
    const mockContextData = {
      user_id: mockUserId,
      session_id: mockSessionId,
      interaction_mode: 'chat_and_whiteboard',
      user_model_state: {
        concepts: {},
        overall_progress: 0,
        current_topic: null,
        session_summary: '',
      },
      uploaded_file_paths: [],
      whiteboard_history: [],
      history: [],
      high_cost_calls: 0,
      max_high_cost_calls: 3,
      latest_turn_no: 0,
      latest_snapshot_index: 0,
    };

    it('should fetch and cache session context', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ context: mockContextData }),
      });

      const context = await sessionManager.getSessionContext(mockSessionId, mockUserId);

      expect(context).toMatchObject(mockContextData);
      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/getSessionContext?sessionId=${mockSessionId}&userId=${mockUserId}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockAdminKey}`,
          }),
        })
      );
    });

    it('should return cached context on subsequent calls', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ context: mockContextData }),
      });

      // First call - should fetch from API
      const context1 = await sessionManager.getSessionContext(mockSessionId, mockUserId);
      
      // Second call - should use cache
      const context2 = await sessionManager.getSessionContext(mockSessionId, mockUserId);

      expect(context1).toEqual(context2);
      expect(fetch).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should return null for 404 response', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        status: 404,
        ok: false,
      });

      const context = await sessionManager.getSessionContext(mockSessionId, mockUserId);

      expect(context).toBeNull();
    });

    it('should handle JSON parse errors', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ context: 'invalid json string {' }),
      });

      const context = await sessionManager.getSessionContext(mockSessionId, mockUserId);

      expect(context).toBeNull();
    });

    it('should validate and build context with defaults', async () => {
      const incompleteContext = {
        user_id: mockUserId,
        session_id: mockSessionId,
        // Missing required fields - should be filled with defaults
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ context: incompleteContext }),
      });

      const context = await sessionManager.getSessionContext(mockSessionId, mockUserId);

      expect(context).toMatchObject({
        user_id: mockUserId,
        session_id: mockSessionId,
        interaction_mode: 'chat_and_whiteboard',
        uploaded_file_paths: [],
        whiteboard_history: [],
        history: [],
        high_cost_calls: 0,
        max_high_cost_calls: 3,
        latest_turn_no: 0,
        latest_snapshot_index: 0,
      });
    });
  });

  describe('updateSessionContext', () => {
    const mockContext: TutorContext = {
      user_id: mockUserId,
      session_id: mockSessionId,
      interaction_mode: 'chat_and_whiteboard',
      uploaded_file_paths: [],
      user_model_state: {
        concepts: {},
        overall_progress: 0,
        current_topic: null,
        session_summary: '',
      },
      whiteboard_history: [[]],
      history: [{ role: 'user', content: 'Hello' }],
      high_cost_calls: 1,
      max_high_cost_calls: 3,
      latest_turn_no: 1,
      latest_snapshot_index: 0,
    };

    it('should update session context successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await sessionManager.updateSessionContext(
        mockSessionId, 
        mockUserId, 
        mockContext
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/updateSessionContext`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockAdminKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );

      // Check that lean context was sent (without bulky fields)
      const callBody = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.context).not.toHaveProperty('history');
      expect(callBody.context).not.toHaveProperty('whiteboard_history');
    });

    it('should return false when update fails', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await sessionManager.updateSessionContext(
        mockSessionId, 
        mockUserId, 
        mockContext
      );

      expect(result).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await sessionManager.updateSessionContext(
        mockSessionId, 
        mockUserId, 
        mockContext
      );

      expect(result).toBe(false);
    });
  });

  describe('sessionExists', () => {
    it('should return true for existing session', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          context: {
            user_id: mockUserId,
            session_id: mockSessionId,
            interaction_mode: 'chat_and_whiteboard',
          }
        }),
      });

      const exists = await sessionManager.sessionExists(mockSessionId, mockUserId);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        status: 404,
        ok: false,
      });

      const exists = await sessionManager.sessionExists(mockSessionId, mockUserId);

      expect(exists).toBe(false);
    });

    it('should return false when error occurs', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const exists = await sessionManager.sessionExists(mockSessionId, mockUserId);

      expect(exists).toBe(false);
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await sessionManager.deleteSession(mockSessionId, mockUserId);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/deleteSession`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ sessionId: mockSessionId, userId: mockUserId }),
        })
      );
    });

    it('should return false when deletion fails', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await sessionManager.deleteSession(mockSessionId, mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('listUserSessions', () => {
    it('should list user sessions with default pagination', async () => {
      const mockSessions = [
        { id: 'session-1', created_at: Date.now(), folder_id: 'folder-1' },
        { id: 'session-2', created_at: Date.now() - 1000 },
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessions: mockSessions }),
      });

      const sessions = await sessionManager.listUserSessions(mockUserId);

      expect(sessions).toEqual(mockSessions);
      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/listUserSessions?userId=${mockUserId}&limit=50&offset=0`,
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle custom pagination parameters', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessions: [] }),
      });

      await sessionManager.listUserSessions(mockUserId, 25, 10);

      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/listUserSessions?userId=${mockUserId}&limit=25&offset=10`,
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should return empty array on error', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const sessions = await sessionManager.listUserSessions(mockUserId);

      expect(sessions).toEqual([]);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      const mockResult = { deletedCount: 5 };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const deletedCount = await sessionManager.cleanupExpiredSessions(30 * 24 * 60 * 60 * 1000);

      expect(deletedCount).toBe(5);
      expect(fetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/cleanupExpiredSessions`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ maxAgeMs: 30 * 24 * 60 * 60 * 1000 }),
        })
      );
    });

    it('should return 0 when cleanup fails', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const deletedCount = await sessionManager.cleanupExpiredSessions();

      expect(deletedCount).toBe(0);
    });
  });

  describe('caching behavior', () => {
    it('should cache contexts and serve from cache', async () => {
      const mockContextData = {
        user_id: mockUserId,
        session_id: mockSessionId,
        interaction_mode: 'chat_and_whiteboard',
        user_model_state: {
          concepts: {},
          overall_progress: 0,
          current_topic: null,
          session_summary: '',
        },
        uploaded_file_paths: [],
        whiteboard_history: [],
        history: [],
        high_cost_calls: 0,
        max_high_cost_calls: 3,
        latest_turn_no: 0,
        latest_snapshot_index: 0,
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ context: mockContextData }),
      });

      // First call should hit the API
      const context1 = await sessionManager.getSessionContext(mockSessionId, mockUserId);
      
      // Second call should use cache
      const context2 = await sessionManager.getSessionContext(mockSessionId, mockUserId);

      expect(context1).toEqual(context2);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should not serve cached context for different user', async () => {
      const mockContextData = {
        user_id: mockUserId,
        session_id: mockSessionId,
        interaction_mode: 'chat_and_whiteboard',
        user_model_state: {
          concepts: {},
          overall_progress: 0,
          current_topic: null,
          session_summary: '',
        },
        uploaded_file_paths: [],
        whiteboard_history: [],
        history: [],
        high_cost_calls: 0,
        max_high_cost_calls: 3,
        latest_turn_no: 0,
        latest_snapshot_index: 0,
      };

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ context: { ...mockContextData, user_id: mockUserId } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ context: { ...mockContextData, user_id: 'different-user' } }),
        });

      await sessionManager.getSessionContext(mockSessionId, mockUserId);
      await sessionManager.getSessionContext(mockSessionId, 'different-user');

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});

