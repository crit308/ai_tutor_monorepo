// Simple test to verify Phase 3.1 implementation status
// Tests the WebSocket server and planner integration

const WebSocket = require('ws');

async function testPhase3Status() {
  console.log('🧪 Testing Phase 3.1 Implementation Status...\n');
  
  try {
    // Test 1: WebSocket Server Connection
    console.log('1️⃣ Testing WebSocket server connection...');
    
    const ws = new WebSocket('ws://localhost:8080/ws/v2/session/test-session-123', {
      headers: {
        'Authorization': 'Bearer test-user-token'
      }
    });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
      
      ws.on('open', () => {
        console.log('✅ WebSocket server connection: SUCCESS');
        clearTimeout(timeout);
        resolve();
      });
      
      ws.on('error', (error) => {
        console.log(`❌ WebSocket server connection: FAILED - ${error.message}`);
        clearTimeout(timeout);
        reject(error);
      });
    });
    
    // Test 2: Session Initialization & Planner Trigger
    console.log('\n2️⃣ Testing session initialization and planner trigger...');
    
    let plannerTriggered = false;
    let focusObjectiveReceived = false;
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📥 Received message:', message.content_type);
        
        if (message.data && message.data.text) {
          console.log('    Text:', message.data.text);
          
          if (message.data.text.includes('Determining session focus')) {
            plannerTriggered = true;
            console.log('✅ Planner trigger: SUCCESS');
          }
          
          if (message.content_type === 'focus_objective') {
            focusObjectiveReceived = true;
            console.log('✅ Focus objective received: SUCCESS');
            console.log('    Topic:', message.data.focus_objective?.topic);
            console.log('    Goal:', message.data.focus_objective?.learning_goal);
          }
        }
      } catch (e) {
        console.log('⚠️ Non-JSON message received');
      }
    });
    
    // Wait for initial messages
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Send a user message
    console.log('\n3️⃣ Testing user message handling...');
    
    ws.send(JSON.stringify({
      type: 'user_message',
      data: {
        text: 'Hello, I want to learn about the water cycle'
      }
    }));
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 4: Summary
    console.log('\n📊 Phase 3.1 Implementation Status Summary:');
    console.log('=====================================');
    console.log(`WebSocket Server: ${ws.readyState === 1 ? '✅ Running' : '❌ Failed'}`);
    console.log(`Session Initialization: ${plannerTriggered ? '✅ Working' : '❌ Failed'}`);
    console.log(`Planner Integration: ${focusObjectiveReceived ? '✅ Working (Mock)' : '⚠️ Partial (Mock only)'}`);
    console.log(`Convex Action Calls: ⚠️ Using mock data (deployment issue)`);
    
    ws.close();
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Fix Convex deployment architecture');
    console.log('2. Enable real planner action calls');
    console.log('3. Proceed to Phase 3.2 (Executor implementation)');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure WebSocket server is running (npm run ws-server)');
    console.log('2. Check environment variables');
    console.log('3. Verify Convex deployment status');
  }
}

// Run the test
testPhase3Status().catch(console.error); 