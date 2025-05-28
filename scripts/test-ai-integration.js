#!/usr/bin/env node

/**
 * Test script for Week 2 AI Integration
 * 
 * This script tests the minimal WebSocket server's AI streaming capabilities
 * by connecting to it and sending test messages.
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Configuration
const WS_URL = process.env.WS_URL || 'ws://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret';
const TEST_SESSION_ID = 'test-session-123';

// Create a test JWT token
function createTestToken() {
  return jwt.sign(
    { 
      sub: 'test-user-ai-integration',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    },
    JWT_SECRET
  );
}

async function testAIIntegration() {
  console.log('🧪 Testing AI Integration in Minimal WebSocket Server');
  console.log('================================================');
  
  const token = createTestToken();
  const wsUrl = `${WS_URL}/ws/tutor/${TEST_SESSION_ID}?token=${token}`;
  
  console.log(`📡 Connecting to: ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
  return new Promise((resolve, reject) => {
    let messageCount = 0;
    let isStreaming = false;
    let streamContent = '';
    const timeout = setTimeout(() => {
      reject(new Error('Test timed out after 30 seconds'));
    }, 30000);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully');
      
      // Test 1: Send a simple user message
      console.log('\n🔬 Test 1: Sending user message');
      ws.send(JSON.stringify({
        type: 'USER_MESSAGE',
        text: 'Hello, can you explain what 2+2 equals?',
        timestamp: Date.now()
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        console.log(`📨 Message ${messageCount}: ${message.type}`);
        
        switch (message.type) {
          case 'TUTOR_CONNECTED':
            console.log('🤖 Tutor connection established');
            break;
            
          case 'USER_MESSAGE_RECEIVED':
            console.log('📝 User message confirmed by server');
            break;
            
          case 'AI_STREAM_DELTA':
            if (!isStreaming) {
              console.log('🌊 AI streaming started');
              isStreaming = true;
            }
            
            streamContent += message.delta;
            process.stdout.write(message.delta);
            
            if (message.isComplete) {
              console.log('\n✅ AI streaming completed');
              console.log(`📄 Full response: "${streamContent}"`);
              
              // Test passed - we received a complete AI response
              clearTimeout(timeout);
              ws.close();
              resolve({
                success: true,
                messagesReceived: messageCount,
                streamContent,
                hasAIResponse: streamContent.length > 0
              });
            }
            break;
            
          case 'AI_STREAM_ERROR':
            console.error('❌ AI streaming error:', message.error);
            clearTimeout(timeout);
            ws.close();
            reject(new Error(`AI streaming failed: ${message.error}`));
            break;
            
          case 'heartbeat_ack':
            console.log('💓 Heartbeat acknowledged');
            break;
            
          default:
            console.log(`ℹ️  Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: ${code} ${reason}`);
      clearTimeout(timeout);
    });
  });
}

// Run the test
if (require.main === module) {
  testAIIntegration()
    .then((result) => {
      console.log('\n🎉 AI Integration Test Results:');
      console.log('==============================');
      console.log(`✅ Success: ${result.success}`);
      console.log(`📊 Messages received: ${result.messagesReceived}`);
      console.log(`🤖 Has AI response: ${result.hasAIResponse}`);
      console.log(`📝 Response length: ${result.streamContent.length} characters`);
      
      if (result.hasAIResponse) {
        console.log('\n🏆 Week 2 AI Integration: PASSED');
        console.log('The minimal WebSocket server successfully:');
        console.log('  - Accepted WebSocket connections');
        console.log('  - Processed user messages');
        console.log('  - Called OpenAI API');
        console.log('  - Streamed AI responses in real-time');
        process.exit(0);
      } else {
        console.log('\n❌ Week 2 AI Integration: FAILED');
        console.log('No AI response received');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 AI Integration Test Failed:');
      console.error(error.message);
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Ensure the minimal WebSocket server is running');
      console.log('2. Check OPENAI_API_KEY environment variable is set');
      console.log('3. Verify network connectivity');
      console.log('4. Check server logs for errors');
      process.exit(1);
    });
}

module.exports = { testAIIntegration }; 