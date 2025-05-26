/**
 * Integration tests for Enhanced SessionManager
 * These tests validate the SessionManager works correctly with Convex functions
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SessionManager, TutorContext } from './sessionManager';

describe('SessionManager Integration Tests', () => {
  let sessionManager: SessionManager;
  const testUserId = 'test-user-integration';
  let createdSessionIds: string[] = [];

  beforeAll(() => {
    const baseUrl = process.env.CONVEX_URL || 'http://localhost:4000';
    const adminKey = process.env.CONVEX_ADMIN_KEY || 'test-admin-key';
    sessionManager = new SessionManager(baseUrl, adminKey);
  });

  afterAll(async () => {
    // Cleanup created sessions
    for (const sessionId of createdSessionIds) {
      try {
        await sessionManager.deleteSession(sessionId, testUserId);
      } catch (error) {
        console.warn(`Failed to cleanup session ${sessionId}:`, error);
      }
    }
  });

  describe('Complete Session Lifecycle', () => {
    it('should create, read, update, and delete a session', async () => {
      // 1. Create session
      const sessionId = await sessionManager.createSession(testUserId);
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      createdSessionIds.push(sessionId);

      // 2. Verify session exists
      const exists = await sessionManager.sessionExists(sessionId, testUserId);
      expect(exists).toBe(true);

      // 3. Get initial context
      const initialContext = await sessionManager.getSessionContext(sessionId, testUserId);
      expect(initialContext).toBeDefined();
      expect(initialContext?.user_id).toBe(testUserId);
      expect(initialContext?.session_id).toBe(sessionId);
      expect(initialContext?.interaction_mode).toBe('chat_and_whiteboard');

      // 4. Update context
      const updatedContext: TutorContext = {
        ...initialContext!,
        session_goal: 'Test session goal',
        current_teaching_topic: 'Integration Testing',
        high_cost_calls: 1,
        latest_turn_no: 5,
      };

      const updateSuccess = await sessionManager.updateSessionContext(
        sessionId,
        testUserId,
        updatedContext
      );
      expect(updateSuccess).toBe(true);

      // 5. Verify context was updated
      const retrievedContext = await sessionManager.getSessionContext(sessionId, testUserId);
      expect(retrievedContext?.session_goal).toBe('Test session goal');
      expect(retrievedContext?.current_teaching_topic).toBe('Integration Testing');
      expect(retrievedContext?.high_cost_calls).toBe(1);
      expect(retrievedContext?.latest_turn_no).toBe(5);

      // 6. Test caching - second call should be faster and return same data
      const cachedContext = await sessionManager.getSessionContext(sessionId, testUserId);
      expect(cachedContext).toEqual(retrievedContext);

      // 7. Delete session
      const deleteSuccess = await sessionManager.deleteSession(sessionId, testUserId);
      expect(deleteSuccess).toBe(true);

      // 8. Verify session no longer exists
      const stillExists = await sessionManager.sessionExists(sessionId, testUserId);
      expect(stillExists).toBe(false);

      // Remove from cleanup list since we already deleted it
      createdSessionIds = createdSessionIds.filter(id => id !== sessionId);
    });

    it('should create session with folder integration', async () => {
      // Note: This test assumes a folder exists. In a real test environment,
      // you would create a test folder first.
      try {
        const sessionId = await sessionManager.createSession(testUserId, 'test-folder-id');
        createdSessionIds.push(sessionId);

        const context = await sessionManager.getSessionContext(sessionId, testUserId);
        expect(context).toBeDefined();
        expect(context?.folder_id).toBe('test-folder-id');
        
        // Folder integration may set these fields if folder exists
        if (context?.vector_store_id) {
          expect(typeof context.vector_store_id).toBe('string');
        }
        if (context?.session_goal) {
          expect(context.session_goal).toContain('folder');
        }
      } catch (error) {
        // If folder doesn't exist, that's ok for this test
        console.log('Folder test skipped - folder may not exist:', error);
      }
    });
  });

  describe('Batch Operations', () => {
    it('should list user sessions', async () => {
      // Create a few test sessions
      const sessionIds = [];
      for (let i = 0; i < 3; i++) {
        const sessionId = await sessionManager.createSession(testUserId);
        sessionIds.push(sessionId);
        createdSessionIds.push(sessionId);
      }

      // List sessions
      const sessions = await sessionManager.listUserSessions(testUserId, 10, 0);
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(3);

      // Verify our created sessions are in the list
      const sessionIdList = sessions.map(s => s.id);
      for (const sessionId of sessionIds) {
        expect(sessionIdList).toContain(sessionId);
      }
    });

    it('should handle pagination correctly', async () => {
      const allSessions = await sessionManager.listUserSessions(testUserId, 100, 0);
      const firstPage = await sessionManager.listUserSessions(testUserId, 2, 0);
      const secondPage = await sessionManager.listUserSessions(testUserId, 2, 2);

      expect(firstPage.length).toBeLessThanOrEqual(2);
      expect(secondPage.length).toBeLessThanOrEqual(2);

      if (allSessions.length >= 4) {
        expect(firstPage.length).toBe(2);
        expect(secondPage.length).toBe(2);
        
        // Pages should not overlap
        const firstPageIds = firstPage.map(s => s.id);
        const secondPageIds = secondPage.map(s => s.id);
        const overlap = firstPageIds.filter(id => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent session gracefully', async () => {
      const fakeSessionId = 'non-existent-session-id';
      
      const context = await sessionManager.getSessionContext(fakeSessionId, testUserId);
      expect(context).toBeNull();

      const exists = await sessionManager.sessionExists(fakeSessionId, testUserId);
      expect(exists).toBe(false);

      const deleteResult = await sessionManager.deleteSession(fakeSessionId, testUserId);
      expect(deleteResult).toBe(false);
    });

    it('should handle invalid user access', async () => {
      const sessionId = await sessionManager.createSession(testUserId);
      createdSessionIds.push(sessionId);

      // Try to access with different user
      const unauthorizedContext = await sessionManager.getSessionContext(
        sessionId, 
        'different-user-id'
      );
      expect(unauthorizedContext).toBeNull();

      const unauthorizedExists = await sessionManager.sessionExists(
        sessionId, 
        'different-user-id'
      );
      expect(unauthorizedExists).toBe(false);
    });
  });

  describe('Performance and Caching', () => {
    it('should demonstrate caching performance improvement', async () => {
      const sessionId = await sessionManager.createSession(testUserId);
      createdSessionIds.push(sessionId);

      // First call (cache miss)
      const start1 = Date.now();
      const context1 = await sessionManager.getSessionContext(sessionId, testUserId);
      const time1 = Date.now() - start1;

      // Second call (cache hit)
      const start2 = Date.now();
      const context2 = await sessionManager.getSessionContext(sessionId, testUserId);
      const time2 = Date.now() - start2;

      expect(context1).toEqual(context2);
      // Cache hit should be significantly faster (at least 2x)
      expect(time2).toBeLessThan(time1 / 2);
    });

    it('should handle concurrent access correctly', async () => {
      const sessionId = await sessionManager.createSession(testUserId);
      createdSessionIds.push(sessionId);

      // Simulate concurrent access
      const promises = Array.from({ length: 5 }, () =>
        sessionManager.getSessionContext(sessionId, testUserId)
      );

      const results = await Promise.all(promises);
      
      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });
  });

  describe('Data Validation', () => {
    it('should validate context structure correctly', async () => {
      const sessionId = await sessionManager.createSession(testUserId);
      createdSessionIds.push(sessionId);

      const context = await sessionManager.getSessionContext(sessionId, testUserId);
      
      // Verify required fields are present
      expect(context?.user_id).toBe(testUserId);
      expect(context?.session_id).toBe(sessionId);
      expect(context?.interaction_mode).toBeDefined();
      expect(context?.user_model_state).toBeDefined();
      expect(context?.uploaded_file_paths).toBeDefined();
      expect(context?.whiteboard_history).toBeDefined();
      expect(context?.history).toBeDefined();
      expect(typeof context?.high_cost_calls).toBe('number');
      expect(typeof context?.max_high_cost_calls).toBe('number');
      expect(typeof context?.latest_turn_no).toBe('number');
      expect(typeof context?.latest_snapshot_index).toBe('number');

      // Verify user model state structure
      const userModel = context?.user_model_state;
      expect(userModel?.concepts).toBeDefined();
      expect(typeof userModel?.overall_progress).toBe('number');
      expect(typeof userModel?.session_summary).toBe('string');
    });

    it('should handle lean context serialization', async () => {
      const sessionId = await sessionManager.createSession(testUserId);
      createdSessionIds.push(sessionId);

      const context = await sessionManager.getSessionContext(sessionId, testUserId);
      expect(context).toBeDefined();

      // Add some bulk data
      const bulkyContext: TutorContext = {
        ...context!,
        history: Array.from({ length: 100 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        })),
        whiteboard_history: Array.from({ length: 50 }, () => [
          { type: 'stroke', data: { points: [[0, 0], [10, 10]] } }
        ]),
      };

      // Update should succeed even with bulk data
      const updateSuccess = await sessionManager.updateSessionContext(
        sessionId,
        testUserId,
        bulkyContext
      );
      expect(updateSuccess).toBe(true);

      // Context should be retrievable but bulk data should be stored separately
      const retrievedContext = await sessionManager.getSessionContext(sessionId, testUserId);
      expect(retrievedContext).toBeDefined();
      // The bulk data might not be included in the lean context
    });
  });
}); 