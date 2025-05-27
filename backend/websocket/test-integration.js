const WebSocket = require('ws');

// Integration Test Configuration
const WS_URL = 'ws://localhost:8080';
const TEST_SESSION_ID = 'integration-test-session';
const TEST_TOKEN = 'test-user-integration';

console.log('🔗 Running Integration Test: Frontend ↔ Convex WebSocket\n');

async function runIntegrationTests() {
  try {
    // Test 1: Tutor WebSocket Connection
    console.log('📡 Test 1: Tutor WebSocket Integration');
    await testTutorWebSocket();
    
    // Test 2: Whiteboard WebSocket Connection
    console.log('\n🎨 Test 2: Whiteboard WebSocket Integration');
    await testWhiteboardWebSocket();
    
    // Test 3: Dual Connection (both tutor and whiteboard)
    console.log('\n🔄 Test 3: Dual Connection Integration');
    await testDualConnection();
    
    console.log('\n🎉 All integration tests passed!');
    console.log('✅ Frontend and Convex WebSocket server are compatible');
    
  } catch (error) {
    console.error('\n💥 Integration test failed:', error.message);
    process.exit(1);
  }
}

async function testTutorWebSocket() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tutor connection timeout')), 10000);
    
    const ws = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}?token=${TEST_TOKEN}`);
    let responseCount = 0;
    
    ws.on('open', () => {
      console.log('  ✅ Tutor connection established');
      
      // Test initial message
      ws.send(JSON.stringify({ type: 'start' }));
      console.log('  📤 Sent start message');
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        responseCount++;
        
        if (message.content_type === 'message') {
          console.log(`  📥 Received message response (${responseCount})`);
          
          if (responseCount === 1) {
            // Test user message
            ws.send(JSON.stringify({
              type: 'user_message',
              data: { text: 'Test integration message' }
            }));
            console.log('  📤 Sent user message');
          } else if (responseCount === 2) {
            // Test pedagogical action
            ws.send(JSON.stringify({ type: 'next' }));
            console.log('  📤 Sent pedagogical action');
          } else if (responseCount >= 3) {
            clearTimeout(timeout);
            ws.close();
            console.log('  ✅ Tutor WebSocket test completed');
            resolve();
          }
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Tutor message parse error: ${error.message}`));
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Tutor WebSocket error: ${error.message}`));
    });
    
    ws.on('close', (code, reason) => {
      if (responseCount < 3) {
        clearTimeout(timeout);
        reject(new Error(`Tutor connection closed prematurely: ${code} - ${reason}`));
      }
    });
  });
}

async function testWhiteboardWebSocket() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Whiteboard connection timeout')), 5000);
    
    const ws = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}/whiteboard?token=${TEST_TOKEN}`);
    ws.binaryType = 'arraybuffer';
    
    ws.on('open', () => {
      console.log('  ✅ Whiteboard connection established');
      
      // Test binary message (simulating Yjs update)
      const testUpdate = new Uint8Array([1, 2, 3, 4]);
      ws.send(testUpdate);
      console.log('  📤 Sent test Yjs update');
      
      setTimeout(() => {
        clearTimeout(timeout);
        ws.close();
        console.log('  ✅ Whiteboard WebSocket test completed');
        resolve();
      }, 1000);
    });
    
    ws.on('message', (data) => {
      console.log('  📥 Received whiteboard data:', data.length, 'bytes');
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Whiteboard WebSocket error: ${error.message}`));
    });
  });
}

async function testDualConnection() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dual connection timeout')), 8000);
    
    let tutorConnected = false;
    let whiteboardConnected = false;
    let responsesReceived = 0;
    
    // Tutor connection
    const tutorWs = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}-dual?token=${TEST_TOKEN}`);
    
    tutorWs.on('open', () => {
      console.log('  ✅ Dual test: Tutor connected');
      tutorConnected = true;
      checkCompletion();
    });
    
    tutorWs.on('message', () => {
      responsesReceived++;
      console.log(`  📥 Dual test: Tutor response ${responsesReceived}`);
      checkCompletion();
    });
    
    // Whiteboard connection
    const whiteboardWs = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}-dual/whiteboard?token=${TEST_TOKEN}`);
    whiteboardWs.binaryType = 'arraybuffer';
    
    whiteboardWs.on('open', () => {
      console.log('  ✅ Dual test: Whiteboard connected');
      whiteboardConnected = true;
      
      // Send test message to tutor
      tutorWs.send(JSON.stringify({ type: 'user_message', data: { text: 'Dual connection test' } }));
      
      checkCompletion();
    });
    
    function checkCompletion() {
      if (tutorConnected && whiteboardConnected && responsesReceived >= 1) {
        clearTimeout(timeout);
        tutorWs.close();
        whiteboardWs.close();
        console.log('  ✅ Dual connection test completed');
        resolve();
      }
    }
    
    tutorWs.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Dual test tutor error: ${error.message}`));
    });
    
    whiteboardWs.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Dual test whiteboard error: ${error.message}`));
    });
  });
}

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n👋 Integration test interrupted');
  process.exit(0);
});

// Run tests
runIntegrationTests().catch((error) => {
  console.error('Integration test suite failed:', error);
  process.exit(1);
}); 