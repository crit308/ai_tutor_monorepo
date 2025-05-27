// Simple test script for the WebSocket server
const WebSocket = require('ws');

// Test configuration
const WS_URL = 'ws://localhost:8080';
const TEST_SESSION_ID = 'test-session-123';
const TEST_TOKEN = 'test-token'; // This will fail auth, but we can test the connection

async function testWebSocketConnection() {
  console.log('🧪 Testing WebSocket server...');
  
  try {
    // Test tutor endpoint
    console.log('Testing tutor endpoint...');
    const tutorWs = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}?token=${TEST_TOKEN}`);
    
    tutorWs.on('open', () => {
      console.log('✅ Tutor WebSocket connected');
      tutorWs.close();
    });
    
    tutorWs.on('close', (code, reason) => {
      console.log(`📝 Tutor WebSocket closed: ${code} - ${reason}`);
    });
    
    tutorWs.on('error', (error) => {
      console.log(`❌ Tutor WebSocket error: ${error.message}`);
    });
    
    // Test whiteboard endpoint
    setTimeout(() => {
      console.log('Testing whiteboard endpoint...');
      const whiteboardWs = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}/whiteboard?token=${TEST_TOKEN}`);
      
      whiteboardWs.on('open', () => {
        console.log('✅ Whiteboard WebSocket connected');
        whiteboardWs.close();
      });
      
      whiteboardWs.on('close', (code, reason) => {
        console.log(`📝 Whiteboard WebSocket closed: ${code} - ${reason}`);
      });
      
      whiteboardWs.on('error', (error) => {
        console.log(`❌ Whiteboard WebSocket error: ${error.message}`);
      });
    }, 1000);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test if server is available
setTimeout(() => {
  testWebSocketConnection();
}, 2000);

console.log('WebSocket test script loaded. Make sure the server is running on port 8080.'); 