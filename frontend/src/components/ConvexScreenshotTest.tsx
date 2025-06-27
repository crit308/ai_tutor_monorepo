'use client';

import React from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useAction } from 'convex/react';
import { api } from 'convex_generated/api';
import { Button } from '@/components/ui/button';

/**
 * Test component to verify AI agent screenshot requests via Convex
 */
export const ConvexScreenshotTest: React.FC = () => {
  const sessionId = useSessionStore(s => s.sessionId);
  const requestScreenshot = useAction(api.skills.whiteboard_screenshot.requestWhiteboardScreenshot);

  const handleTestAIScreenshotRequest = async () => {
    if (!sessionId) {
      alert('No session ID available');
      return;
    }

    try {
      console.log('[ConvexScreenshotTest] Simulating AI agent screenshot request...');
      
      const result = await requestScreenshot({
        session_id: sessionId,
        request_context: "Testing AI agent screenshot capability - user clicked test button"
      });
      
      if (result.success && result.image_data) {
        console.log('[ConvexScreenshotTest] Screenshot received successfully!');
        
        // Display the screenshot in a new window for verification
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head><title>AI Agent Screenshot Test</title></head>
              <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0;">
                <div style="text-align: center;">
                  <h2>AI Agent Screenshot Test Result</h2>
                  <p>Screenshot captured via Convex real-time system</p>
                  <img src="${result.image_data}" style="max-width: 90vw; max-height: 80vh; border: 2px solid #333; border-radius: 8px;" />
                  <p style="margin-top: 20px; color: #666;">Request ID: ${result.request_id}</p>
                </div>
              </body>
            </html>
          `);
        }
        
        alert(`AI Agent Screenshot Test SUCCESSFUL!\n\nThe AI agent can now request screenshots via Convex.\nCheck the new window to see the captured image.\n\nRequest ID: ${result.request_id}`);
      } else {
        console.error('[ConvexScreenshotTest] Screenshot failed:', result.error_message);
        alert(`AI Agent Screenshot Test FAILED:\n${result.error_message}\n\nRequest ID: ${result.request_id}`);
      }
    } catch (error) {
      console.error('[ConvexScreenshotTest] Error requesting screenshot:', error);
      alert(`AI Agent Screenshot Test ERROR:\n${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
      <h3 className="text-lg font-semibold mb-2 text-green-800">🤖 AI Agent Screenshot Test</h3>
      <p className="text-sm text-green-700 mb-4">
        This tests the AI agent's ability to request screenshots via Convex real-time updates.
        The AI agent can now see exactly what students see!
      </p>
      <div className="flex gap-2">
        <Button 
          onClick={handleTestAIScreenshotRequest}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          🤖 Test AI Agent Screenshot Request
        </Button>
      </div>
      <p className="text-xs text-green-600 mt-2">
        Session: {sessionId ? `${sessionId.slice(0, 8)}...` : 'No session'}
      </p>
    </div>
  );
}; 