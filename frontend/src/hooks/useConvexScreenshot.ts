import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useQuery, useAction } from 'convex/react';
import { api } from 'convex_generated/api';
import html2canvas from 'html2canvas';

/**
 * Hook for handling Convex-based screenshot requests from AI agents
 * Integrates with the existing screenshot capture functionality
 */
export function useConvexScreenshot() {
  const sessionId = useSessionStore(s => s.sessionId);
  const lastCheckedTimestamp = useRef<number>(Date.now());
  
  // Convex action for screenshot handling (was useMutation, now useAction)
  const submitScreenshotResponse = useAction(api.skills.whiteboard_screenshot.submitScreenshotResponse);
  
  // Listen for Convex-based screenshot requests
  const sessionMessages = useQuery(api.websockets.getSessionMessages, 
    sessionId ? {
      session_id: sessionId,
      since_timestamp: lastCheckedTimestamp.current
    } : "skip"
  );

  // Enhanced screenshot capture function (based on existing implementation)
  const captureWhiteboardScreenshot = async (): Promise<string | null> => {
    try {
      // Find whiteboard element by data attribute
      const whiteboardElement = document.querySelector('[data-whiteboard-container]') as HTMLElement;
      
      if (!whiteboardElement) {
        // Container might not be mounted yet – exit quietly and retry on next request
        if (process.env.NODE_ENV === 'development') {
          console.debug('[useConvexScreenshot] Whiteboard container not found – skipping capture');
        }
        return null;
      }

      console.log('[useConvexScreenshot] Capturing screenshot of whiteboard...');
      
      // Get canvas and text overlay elements
      const canvasElement = whiteboardElement.querySelector('canvas');
      const textOverlayContainer = whiteboardElement.querySelector('div:last-child'); // The div with text overlays
      
      if (canvasElement) {
        try {
          console.log('[useConvexScreenshot] Forcing fabric.js to render all text objects...');
          
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
          
          console.log('[useConvexScreenshot] Creating composite screenshot with text overlays...');
          
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
            console.log('[useConvexScreenshot] Composite screenshot with text successful');
            return dataUrl;
          }
        } catch (compositeError) {
          console.warn('[useConvexScreenshot] Composite screenshot failed:', compositeError);
          
          // Fallback to direct canvas capture
          try {
            const dataUrl = canvasElement.toDataURL('image/png');
            console.log('[useConvexScreenshot] Direct canvas screenshot successful (no text overlays)');
            return dataUrl;
          } catch (canvasError) {
            console.warn('[useConvexScreenshot] Direct canvas capture also failed:', canvasError);
          }
        }
      }
      
      // Final fallback: Try html2canvas with simplified options
      console.log('[useConvexScreenshot] Attempting html2canvas as final fallback...');
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
        console.log('[useConvexScreenshot] html2canvas fallback successful');
        return dataUrl;
        
      } catch (html2canvasError) {
        console.error('[useConvexScreenshot] html2canvas fallback also failed:', html2canvasError);
      }
      
      // Last resort: Create a placeholder
      console.log('[useConvexScreenshot] Creating placeholder screenshot...');
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
      console.error('[useConvexScreenshot] Screenshot capture failed completely:', error);
      return null;
    }
  };

  // Process Convex screenshot requests
  useEffect(() => {
    if (!sessionMessages || !sessionId) return;

    sessionMessages.forEach(async (message) => {
      if (message.data?.type === 'screenshot_request') {
        console.log('[useConvexScreenshot] Convex screenshot request received:', message.data.request_id);
        console.log('[useConvexScreenshot] Context:', message.data.context || 'No context provided');
        
        try {
          const screenshot = await captureWhiteboardScreenshot();
          
          // Submit response via Convex
          await submitScreenshotResponse({
            session_id: sessionId,
            request_id: message.data.request_id,
            image_data: screenshot || '',
            success: screenshot !== null,
            error_message: screenshot ? undefined : 'Screenshot capture failed'
          });
          
          console.log('[useConvexScreenshot] Convex screenshot response submitted successfully');
          
        } catch (error) {
          console.error('[useConvexScreenshot] Convex screenshot error:', error);
          
          // Submit error response
          try {
            await submitScreenshotResponse({
              session_id: sessionId,
              request_id: message.data.request_id,
              image_data: '',
              success: false,
              error_message: error instanceof Error ? error.message : 'Unknown error'
            });
          } catch (submitError) {
            console.error('[useConvexScreenshot] Failed to submit error response:', submitError);
          }
        }
      }
    });
    
    // Update last checked timestamp
    if (sessionMessages.length > 0) {
      lastCheckedTimestamp.current = Math.max(...sessionMessages.map(m => m.timestamp));
    }
  }, [sessionMessages, sessionId, submitScreenshotResponse]);

  return {
    captureWhiteboardScreenshot
  };
} 