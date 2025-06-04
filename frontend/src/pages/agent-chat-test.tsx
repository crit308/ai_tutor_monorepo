import React, { useState } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import AgentTutorChat from '@/components/AgentTutorChat';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function TestApp() {
  const [sessionId, setSessionId] = useState<string>(() => {
    // Generate a random session ID for testing
    return `test-session-${Math.random().toString(36).substr(2, 9)}`;
  });

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Agent Chat Test Page
          </h1>
          <p className="text-gray-600 mb-4">
            Testing the new agent-powered chat system
          </p>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label htmlFor="session-id" className="text-sm font-medium text-gray-700">
                Session ID:
              </label>
              <input
                id="session-id"
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter session ID"
              />
            </div>
            <button
              onClick={() => setSessionId(`test-session-${Math.random().toString(36).substr(2, 9)}`)}
              className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Generate New
            </button>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <h3 className="text-sm font-medium text-blue-800 mb-1">🎯 Agent Streaming Features:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>✅ Real-time message deltas (replacing HTTP streaming)</li>
              <li>✅ User authentication & session security</li>
              <li>✅ Optimistic UI updates for instant feedback</li>
              <li>✅ Message history with pagination</li>
              <li>✅ Session-based thread management</li>
              <li>✅ Smooth text animation during streaming</li>
              <li>✅ Backward compatibility with session_messages</li>
            </ul>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
            <h3 className="text-sm font-medium text-green-800 mb-1">🔄 Migration Status:</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>✅ Phase 1: Backend Functions & Agent Component</li>
              <li>✅ Phase 2: Frontend Integration & Authentication</li>
              <li>✅ Phase 3: Testing & Legacy Cleanup (Complete!)</li>
              <li>⏭️ Phase 4: Documentation & Polish</li>
            </ul>
          </div>
          
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <h3 className="text-sm font-medium text-red-800 mb-1">🗑️ Legacy Code Removed:</h3>
            <ul className="text-sm text-red-700 space-y-1">
              <li>❌ <code>useHttpTutorStream.ts</code> - HTTP streaming hook</li>
              <li>❌ <code>HttpStreamingDemo.tsx</code> - HTTP demo component</li>
              <li>❌ <code>/stream-chat</code> - HTTP streaming endpoint</li>
              <li>❌ Manual token management code</li>
              <li>✅ All references cleaned up successfully</li>
            </ul>
          </div>
        </div>

        <div className="h-[600px]">
          <AgentTutorChat 
            sessionId={sessionId}
            className="h-full"
          />
        </div>
        
        <div className="mt-4 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Debug Info:</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p><strong>Session ID:</strong> {sessionId}</p>
            <p><strong>Convex URL:</strong> {process.env.NEXT_PUBLIC_CONVEX_URL}</p>
            <p><strong>Component:</strong> AgentTutorChat</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentChatTestPage() {
  return (
    <ConvexProvider client={convex}>
      <TestApp />
    </ConvexProvider>
  );
} 