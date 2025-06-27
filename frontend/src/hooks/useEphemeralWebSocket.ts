import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useAuthToken } from '@convex-dev/auth/react';
import { CanvasObjectSpec, WhiteboardAction } from '@/lib/types';
import html2canvas from 'html2canvas';

/**
 * Hook for managing ephemeral whiteboard objects (pointers, highlights, question tags)
 * via the minimal WebSocket server. These objects have TTL and don't persist to the database.
 * Also handles screenshot requests for visual AI analysis.
 */
export function useEphemeralWebSocket(
  enabled: boolean,
  dispatchWhiteboardAction: (action: WhiteboardAction | WhiteboardAction[]) => void
) {
  const sessionId = useSessionStore(s => s.sessionId);
  const token = useAuthToken();
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to ephemeral WebSocket endpoint
  useEffect(() => {
    if (!enabled || !sessionId || !token) return;

    const wsOrigin = process.env.NEXT_PUBLIC_BACKEND_WS_ORIGIN || 'ws://localhost:8080';
    const wsUrl = `${wsOrigin}/ws/ephemeral/${sessionId}?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useEphemeralWebSocket] Connected to ephemeral WebSocket');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'EPHEMERAL_INITIAL_STATE':
            // Add initial ephemeral objects to canvas
            if (message.objects && message.objects.length > 0) {
              const ephemeralSpecs = message.objects.map((obj: any) => ({
                id: obj.id,
                kind: obj.type + '_ephemeral',
                x: obj.x,
                y: obj.y,
                ...obj.data,
                metadata: {
                  isEphemeral: true,
                  expiresAt: obj.expiresAt,
                  userId: obj.userId,
                  source: 'ephemeral'
                }
              }));
              
              dispatchWhiteboardAction({
                type: 'ADD_EPHEMERAL_OBJECTS',
                objects: ephemeralSpecs
              } as any);
            }
            break;
            
          case 'EPHEMERAL_OBJECT_ADDED':
            // Add new ephemeral object
            if (message.object) {
              const spec: CanvasObjectSpec = {
                id: message.object.id,
                kind: message.object.type + '_ephemeral',
                x: message.object.x,
                y: message.object.y,
                ...message.object.data,
                metadata: {
                  isEphemeral: true,
                  expiresAt: message.object.expiresAt,
                  userId: message.object.userId,
                  source: 'ephemeral'
                }
              };
              
              dispatchWhiteboardAction({
                type: 'ADD_EPHEMERAL',
                spec
              } as any);
            }
            break;
            
          case 'EPHEMERAL_OBJECT_REMOVED':
            // Remove ephemeral object
            dispatchWhiteboardAction({
              type: 'DELETE_EPHEMERAL',
              id: message.objectId
            } as any);
            break;
            
          case 'EPHEMERAL_OBJECTS_EXPIRED':
            // Remove expired objects
            if (message.expiredIds && message.expiredIds.length > 0) {
              message.expiredIds.forEach((id: string) => {
                dispatchWhiteboardAction({
                  type: 'DELETE_EPHEMERAL',
                  id
                } as any);
              });
            }
            break;

          case 'SCREENSHOT_REQUEST':
            // Handle screenshot request from backend
            console.log('[useEphemeralWebSocket] Screenshot requested with ID:', message.requestId);
            handleScreenshotRequest(message.requestId);
            break;
            
          default:
            console.warn('[useEphemeralWebSocket] Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('[useEphemeralWebSocket] Failed to parse message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[useEphemeralWebSocket] Disconnected from ephemeral WebSocket');
    };

    ws.onerror = (error) => {
      console.error('[useEphemeralWebSocket] WebSocket error:', error);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, sessionId, token, dispatchWhiteboardAction]);

  // Function to capture whiteboard screenshot
  const captureWhiteboardScreenshot = useCallback(async (): Promise<string | null> => {
    try {
      // Find whiteboard element by data attribute
      const whiteboardElement = document.querySelector('[data-whiteboard-container]') as HTMLElement;
      
      if (!whiteboardElement) {
        console.error('[useEphemeralWebSocket] Whiteboard container not found');
        return null;
      }

      console.log('[useEphemeralWebSocket] Capturing screenshot of whiteboard...');
      
      // Get canvas and text overlay elements
      const canvasElement = whiteboardElement.querySelector('canvas');
      const textOverlayContainer = whiteboardElement.querySelector('div:last-child'); // The div with text overlays
      
      if (canvasElement) {
        try {
          console.log('[useEphemeralWebSocket] Forcing fabric.js to render all text objects...');
          
          // Get fabric canvas instance and force text rendering
          const fabricCanvas = (canvasElement as any).__fabric;
          if (fabricCanvas) {
            // Force all text objects to be rendered properly
            const textObjects = fabricCanvas.getObjects().filter((obj: any) => obj.type === 'textbox' || obj.type === 'text');
            textObjects.forEach((obj: any) => {
              obj.set({
                visible: true,
                opacity: 1
              });
              obj.setCoords();
            });
            fabricCanvas.requestRenderAll();
            
            // Wait for render to complete
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          console.log('[useEphemeralWebSocket] Creating composite screenshot with text overlays...');
          
          // Create a new canvas to composite both canvas and text
          const compositeCanvas = document.createElement('canvas');
          const rect = whiteboardElement.getBoundingClientRect();
          compositeCanvas.width = canvasElement.width || rect.width;
          compositeCanvas.height = canvasElement.height || rect.height;
          const ctx = compositeCanvas.getContext('2d');
          
          if (ctx) {
            // Draw the fabric canvas first
            ctx.drawImage(canvasElement, 0, 0);
            
            // Draw text overlays on top
            if (textOverlayContainer) {
              const textDivs = textOverlayContainer.querySelectorAll('div[style*="position: absolute"]');
              
              textDivs.forEach((textDiv: Element) => {
                const htmlDiv = textDiv as HTMLElement;
                const computedStyle = window.getComputedStyle(htmlDiv);
                
                // Get position and styling
                const left = parseInt(computedStyle.left) || 0;
                const top = parseInt(computedStyle.top) || 0;
                const fontSize = computedStyle.fontSize;
                const fontFamily = computedStyle.fontFamily;
                const color = computedStyle.color;
                const text = htmlDiv.textContent || '';
                
                if (text.trim()) {
                  // Set up text styling
                  ctx.font = `${fontSize} ${fontFamily}`;
                  ctx.fillStyle = color;
                  ctx.textBaseline = 'top';
                  
                  // Handle multi-line text
                  const lines = text.split('\n');
                  const lineHeight = parseInt(fontSize) * 1.2; // Approximate line height
                  
                  lines.forEach((line, index) => {
                    if (line.trim()) {
                      ctx.fillText(line, left, top + (index * lineHeight));
                    }
                  });
                }
              });
            }
            
            const dataUrl = compositeCanvas.toDataURL('image/png');
            console.log('[useEphemeralWebSocket] Composite screenshot with text successful');
            return dataUrl;
          }
        } catch (compositeError) {
          console.warn('[useEphemeralWebSocket] Composite screenshot failed:', compositeError);
          
          // Fallback to direct canvas capture
          try {
            const dataUrl = canvasElement.toDataURL('image/png');
            console.log('[useEphemeralWebSocket] Direct canvas screenshot successful (no text overlays)');
            return dataUrl;
          } catch (canvasError) {
            console.warn('[useEphemeralWebSocket] Direct canvas capture also failed:', canvasError);
          }
        }
      }
      
      // Final fallback: Try html2canvas with simplified options
      console.log('[useEphemeralWebSocket] Attempting html2canvas as final fallback...');
      try {
        const canvas = await html2canvas(whiteboardElement, {
          backgroundColor: '#ffffff',
          scale: 0.8,
          useCORS: false,
          allowTaint: false,
          foreignObjectRendering: false,
          logging: false,
          height: whiteboardElement.offsetHeight,
          width: whiteboardElement.offsetWidth,
          // Skip stylesheets to avoid CSS parsing issues
          ignoreElements: (element) => {
            const tagName = element.tagName.toLowerCase();
            return tagName === 'style' || tagName === 'link' || tagName === 'script';
          }
        });

        const dataUrl = canvas.toDataURL('image/png');
        console.log('[useEphemeralWebSocket] html2canvas fallback successful');
        return dataUrl;
        
      } catch (html2canvasError) {
        console.error('[useEphemeralWebSocket] html2canvas fallback also failed:', html2canvasError);
      }
      
      // Last resort: Create a placeholder
      console.log('[useEphemeralWebSocket] Creating placeholder screenshot...');
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 600);
        ctx.strokeStyle = '#cccccc';
        ctx.strokeRect(0, 0, 800, 600);
        ctx.fillStyle = '#666666';
        ctx.font = '24px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Whiteboard Screenshot', 400, 280);
        ctx.fillText('(Capture temporarily unavailable)', 400, 320);
        
        return canvas.toDataURL('image/png');
      }
      
      return null;
      
    } catch (error) {
      console.error('[useEphemeralWebSocket] Screenshot capture failed completely:', error);
      return null;
    }
  }, []);

  // Handle screenshot request from backend
  const handleScreenshotRequest = useCallback(async (requestId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useEphemeralWebSocket] WebSocket not connected for screenshot response');
      return;
    }

    try {
      const screenshot = await captureWhiteboardScreenshot();
      
      // Send screenshot response back to backend
      const response = {
        type: 'SCREENSHOT_RESPONSE',
        requestId,
        screenshot: screenshot,
        success: screenshot !== null
      };

      wsRef.current.send(JSON.stringify(response));
      console.log('[useEphemeralWebSocket] Screenshot response sent for request:', requestId);
    } catch (error) {
      console.error('[useEphemeralWebSocket] Failed to handle screenshot request:', error);
      
      // Send error response
      const errorResponse = {
        type: 'SCREENSHOT_RESPONSE',
        requestId,
        screenshot: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      wsRef.current?.send(JSON.stringify(errorResponse));
    }
  }, [captureWhiteboardScreenshot]);

  // Function to add ephemeral objects
  const writeEphemeral = useCallback((spec: CanvasObjectSpec) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[useEphemeralWebSocket] WebSocket not connected');
      return;
    }

    // Determine object type from spec
    let objectType: 'pointer' | 'highlight' | 'question_tag' = 'pointer';
    if (spec.kind?.includes('highlight')) {
      objectType = 'highlight';
    } else if (spec.kind?.includes('question')) {
      objectType = 'question_tag';
    }

    // Calculate TTL based on object type
    let ttl = 5000; // Default 5 seconds
    if (objectType === 'highlight') {
      ttl = 60000; // 1 minute for highlights
    } else if (objectType === 'pointer') {
      ttl = 3000; // 3 seconds for pointers
    } else if (objectType === 'question_tag') {
      ttl = 300000; // 5 minutes for question tags
    }

    const message = {
      type: 'ADD_EPHEMERAL',
      object: {
        id: spec.id,
        type: objectType,
        x: spec.x || 0,
        y: spec.y || 0,
        data: {
          // Include other spec properties as data
          kind: spec.kind,
          width: spec.width,
          height: spec.height,
          stroke: spec.stroke,
          strokeWidth: spec.strokeWidth,
          fill: spec.fill,
          points: spec.points,
          text: spec.text,
          fontSize: spec.fontSize,
          ...spec.metadata
        },
        expiresAt: Date.now() + ttl
      }
    };

    try {
      wsRef.current.send(JSON.stringify(message));
      
      // Optimistically add to canvas
      dispatchWhiteboardAction({
        type: 'ADD_EPHEMERAL',
        spec: {
          ...spec,
          metadata: {
            ...spec.metadata,
            isEphemeral: true,
            expiresAt: message.object.expiresAt,
            source: 'ephemeral'
          }
        }
      } as any);
      
    } catch (error) {
      console.error('[useEphemeralWebSocket] Failed to send ephemeral object:', error);
    }
  }, [dispatchWhiteboardAction]);

  return {
    writeEphemeral,
    captureWhiteboardScreenshot,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}

export type UseEphemeralWebSocketReturnType = ReturnType<typeof useEphemeralWebSocket>; 