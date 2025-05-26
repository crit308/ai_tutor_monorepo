const WebSocket = require('ws');

// Test configuration
const WS_URL = 'ws://localhost:8080';
const TEST_SESSION_ID = 'test-session-123';
const TEST_TOKEN = 'test-token';

// Mock JWT for testing (in real implementation, this would be a valid Supabase JWT)
const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiaWF0IjoxNjE2MjM5MDIyfQ.fake-signature';

async function testTutorWebSocket() {
  console.log('🚀 Starting Tutor WebSocket Test...\n');

  try {
    // Test 1: Basic Connection
    console.log('📡 Test 1: Basic Connection');
    const ws = new WebSocket(`${WS_URL}/ws/v2/session/${TEST_SESSION_ID}?token=${mockJwt}`);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

      ws.on('open', () => {
        console.log('✅ Connected to tutor WebSocket');
        clearTimeout(timeout);
        resolve();
      });

      ws.on('error', (error) => {
        console.error('❌ Connection failed:', error.message);
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Test 2: Initial State
    console.log('\n📋 Test 2: Initial State Message');
    await new Promise((resolve) => {
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('✅ Received initial state:', {
            content_type: message.content_type,
            response_type: message.data?.response_type,
            text: message.data?.text?.substring(0, 50) + '...'
          });
          resolve();
        } catch (error) {
          console.error('❌ Failed to parse initial state:', error.message);
          resolve();
        }
      });
    });

    // Test 3: User Message
    console.log('\n💬 Test 3: User Message');
    const userMessage = {
      type: 'user_message',
      data: {
        text: 'Hello, can you help me learn calculus?'
      }
    };

    ws.send(JSON.stringify(userMessage));
    console.log('✅ Sent user message');

    // Wait for response
    await new Promise((resolve) => {
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.content_type === 'message') {
            console.log('✅ Received tutor response:', {
              content_type: message.content_type,
              text: message.data?.text?.substring(0, 80) + '...'
            });
            resolve();
          }
        } catch (error) {
          console.error('❌ Failed to parse response:', error.message);
          resolve();
        }
      });
    });

    // Test 4: Pedagogical Actions
    console.log('\n🎯 Test 4: Pedagogical Actions');
    const actions = ['next', 'previous', 'summary', 'start'];
    
    for (const action of actions) {
      const actionMessage = { type: action };
      ws.send(JSON.stringify(actionMessage));
      console.log(`✅ Sent ${action} action`);
      
      // Brief delay between actions
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Test 5: Answer Submission
    console.log('\n📝 Test 5: Answer Submission');
    const answerMessage = {
      type: 'answer',
      data: {
        question_id: 'test-question-1',
        selected_answer: 'A',
        answer_text: 'The derivative of x^2 is 2x'
      }
    };

    ws.send(JSON.stringify(answerMessage));
    console.log('✅ Sent answer submission');

    // Test 6: Canvas Click
    console.log('\n🎨 Test 6: Canvas Click');
    const canvasClick = {
      type: 'canvas_click',
      data: {
        object_id: 'test-object-123'
      }
    };

    ws.send(JSON.stringify(canvasClick));
    console.log('✅ Sent canvas click');

    // Test 7: Whiteboard Mode Update
    console.log('\n🖼️ Test 7: Whiteboard Mode Update');
    const modeUpdate = {
      type: 'user_message',
      data: { text: 'Test message' },
      whiteboard_mode: 'chat_only'
    };

    ws.send(JSON.stringify(modeUpdate));
    console.log('✅ Sent whiteboard mode update');

    // Test 8: Heartbeat
    console.log('\n💓 Test 8: Heartbeat');
    const heartbeat = { type: 'heartbeat' };
    ws.send(JSON.stringify(heartbeat));
    console.log('✅ Sent heartbeat');

    // Wait for heartbeat response
    await new Promise((resolve) => {
      const handler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'heartbeat_ack') {
            console.log('✅ Received heartbeat acknowledgment');
            ws.off('message', handler);
            resolve();
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };
      ws.on('message', handler);
      
      // Timeout after 2 seconds
      setTimeout(() => {
        ws.off('message', handler);
        console.log('⚠️ Heartbeat response timeout');
        resolve();
      }, 2000);
    });

    // Test 9: Error Handling
    console.log('\n❌ Test 9: Error Handling');
    const invalidMessage = { type: 'invalid_type', data: 'test' };
    ws.send(JSON.stringify(invalidMessage));
    console.log('✅ Sent invalid message type');

    // Brief wait for any responses
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 10: Session End
    console.log('\n🛑 Test 10: Session End');
    const endSession = { type: 'end_session' };
    ws.send(JSON.stringify(endSession));
    console.log('✅ Sent end session');

    // Wait for connection close
    await new Promise((resolve) => {
      ws.on('close', (code, reason) => {
        console.log(`✅ Connection closed: ${code} - ${reason}`);
        resolve();
      });
      
      // Timeout after 3 seconds
      setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
        resolve();
      }, 3000);
    });

    console.log('\n🎉 All tutor WebSocket tests completed successfully!');

  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  }
}

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Run tests
if (require.main === module) {
  testTutorWebSocket().catch(console.error);
}

module.exports = { testTutorWebSocket }; 