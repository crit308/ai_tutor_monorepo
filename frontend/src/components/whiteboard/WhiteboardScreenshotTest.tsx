'use client';

import React from 'react';
import { useWhiteboard } from '@/contexts/WhiteboardProvider';
import { Button } from '@/components/ui/button';

/**
 * Test component to verify whiteboard screenshot functionality
 * This component provides multiple test buttons to diagnose and fix text capture issues
 */
export const WhiteboardScreenshotTest: React.FC = () => {
  const { captureWhiteboardScreenshot, fabricCanvas } = useWhiteboard();

  const handleTestScreenshot = async () => {
    try {
      console.log('[WhiteboardScreenshotTest] Testing screenshot capture...');
      
      // Try direct canvas capture first
      const whiteboardElement = document.querySelector('[data-whiteboard-container]') as HTMLElement;
      if (!whiteboardElement) {
        alert('Whiteboard container not found');
        return;
      }
      
      const canvasElement = whiteboardElement.querySelector('canvas');
      if (canvasElement) {
        try {
          const dataUrl = canvasElement.toDataURL('image/png');
          
          // Create a temporary link to download the screenshot for testing
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `whiteboard-direct-${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          alert('Direct canvas screenshot captured and downloaded successfully!');
          return;
        } catch (error) {
          console.warn('Direct canvas capture failed:', error);
        }
      }
      
      // Fallback to the hook method
      const screenshot = await captureWhiteboardScreenshot();
      
      if (screenshot) {
        console.log('[WhiteboardScreenshotTest] Screenshot captured successfully!');
        
        // Create a temporary link to download the screenshot for testing
        const link = document.createElement('a');
        link.href = screenshot;
        link.download = `whiteboard-screenshot-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('Screenshot captured and downloaded successfully!');
      } else {
        console.error('[WhiteboardScreenshotTest] Failed to capture screenshot');
        alert('Failed to capture screenshot');
      }
    } catch (error) {
      console.error('[WhiteboardScreenshotTest] Error during screenshot test:', error);
      alert('Error during screenshot test: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleForcedTextScreenshot = async () => {
    try {
      if (!fabricCanvas) {
        alert('No fabric canvas found!');
        return;
      }
      
      console.log('[ForcedTextScreenshot] Forcing text render...');
      
      // Get all text objects and ensure they're properly rendered
      const textObjects = fabricCanvas.getObjects().filter(obj => obj.type === 'textbox' || obj.type === 'text');
      
      if (textObjects.length === 0) {
        alert('No text objects found on canvas. Try adding some text first.');
        return;
      }
      
      // Force all text objects to be visible and properly configured
      textObjects.forEach((obj: any) => {
        obj.set({
          visible: true,
          opacity: 1,
          selectable: false, // Ensure selection handles don't interfere
          evented: false
        });
        obj.setCoords();
      });
      
      // Force a complete re-render
      fabricCanvas.requestRenderAll();
      
      // Wait for render to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Now capture the canvas
      const canvasElement = fabricCanvas.getElement();
      const dataUrl = canvasElement.toDataURL('image/png');
      
      // Download the result
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `whiteboard-forced-text-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Re-enable selection for text objects
      textObjects.forEach((obj: any) => {
        obj.set({
          selectable: true,
          evented: true
        });
      });
      fabricCanvas.requestRenderAll();
      
      alert(`Forced text screenshot captured!\nFound ${textObjects.length} text objects.`);
      
    } catch (error) {
      console.error('[ForcedTextScreenshot] Error:', error);
      alert('Forced text screenshot failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleSimpleTest = () => {
    // Create a simple test image to verify the download mechanism
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#000000';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Test Screenshot', 200, 150);
      
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `test-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert('Test image created and downloaded!');
    }
  };

  const handleDebugCanvas = () => {
    if (!fabricCanvas) {
      alert('No fabric canvas found!');
      return;
    }
    
    const objects = fabricCanvas.getObjects();
    console.log('[Debug] All canvas objects:', objects);
    
    const textObjects = objects.filter(obj => obj.type === 'textbox' || obj.type === 'text');
    console.log('[Debug] Text objects:', textObjects);
    
    const debugInfo = {
      totalObjects: objects.length,
      textObjects: textObjects.length,
      objectTypes: objects.map(obj => obj.type),
      textContents: textObjects.map((obj: any) => obj.text || 'No text'),
      canvasSize: { width: fabricCanvas.width, height: fabricCanvas.height }
    };
    
    console.log('[Debug] Canvas info:', debugInfo);
    alert(`Canvas Debug:\nTotal objects: ${debugInfo.totalObjects}\nText objects: ${debugInfo.textObjects}\nTypes: ${debugInfo.objectTypes.join(', ')}\nText contents: ${debugInfo.textContents.join(', ')}`);
  };

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="text-lg font-semibold mb-2">Screenshot Test</h3>
      <p className="text-sm text-gray-600 mb-4">
        Test whiteboard screenshot functionality. Add some text to the whiteboard first, then test.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button 
          onClick={handleTestScreenshot}
          variant="outline"
          className="bg-blue-500 text-white hover:bg-blue-600"
        >
          📸 Normal Test
        </Button>
        <Button 
          onClick={handleForcedTextScreenshot}
          variant="outline"
          className="bg-red-500 text-white hover:bg-red-600"
        >
          ✏️ Force Text
        </Button>
        <Button 
          onClick={handleDebugCanvas}
          variant="outline"
          className="bg-yellow-500 text-white hover:bg-yellow-600"
        >
          🔍 Debug Canvas
        </Button>
        <Button 
          onClick={handleSimpleTest}
          variant="outline"
          className="bg-green-500 text-white hover:bg-green-600"
        >
          🧪 Simple Test
        </Button>
      </div>
    </div>
  );
};

export default WhiteboardScreenshotTest; 