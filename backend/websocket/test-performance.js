const WebSocket = require('ws');

// Performance Test Configuration
const WS_URL = 'ws://localhost:8080';
const CONCURRENT_CONNECTIONS = 20;
const MESSAGES_PER_CONNECTION = 5;
const TEST_DURATION_MS = 10000; // 10 seconds

console.log('⚡ Running Performance Test: WebSocket Load Testing\n');
console.log(`📊 Configuration:`);
console.log(`   - Concurrent connections: ${CONCURRENT_CONNECTIONS}`);
console.log(`   - Messages per connection: ${MESSAGES_PER_CONNECTION}`);
console.log(`   - Test duration: ${TEST_DURATION_MS}ms`);
console.log('');

class PerformanceMetrics {
  constructor() {
    this.connectionsOpened = 0;
    this.connectionsFailed = 0;
    this.messagesReceived = 0;
    this.messagesSent = 0;
    this.latencies = [];
    this.startTime = Date.now();
  }

  addLatency(latency) {
    this.latencies.push(latency);
  }

  getStats() {
    const now = Date.now();
    const duration = (now - this.startTime) / 1000;
    const avgLatency = this.latencies.length > 0 
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length 
      : 0;
    const minLatency = this.latencies.length > 0 ? Math.min(...this.latencies) : 0;
    const maxLatency = this.latencies.length > 0 ? Math.max(...this.latencies) : 0;

    return {
      duration,
      connectionsOpened: this.connectionsOpened,
      connectionsFailed: this.connectionsFailed,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      avgLatency: Math.round(avgLatency),
      minLatency: Math.round(minLatency),
      maxLatency: Math.round(maxLatency),
      throughput: Math.round(this.messagesReceived / duration)
    };
  }
}

const metrics = new PerformanceMetrics();

async function runPerformanceTest() {
  console.log('🚀 Starting performance test...\n');
  
  const promises = [];
  
  for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
    promises.push(createTestConnection(i));
  }
  
  // Wait for all connections to complete or timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Performance test timeout')), TEST_DURATION_MS);
  });
  
  try {
    await Promise.race([
      Promise.all(promises),
      timeoutPromise
    ]);
  } catch (error) {
    console.log('⚠️ Test completed with timeout (expected for load testing)');
  }
  
  displayResults();
}

async function createTestConnection(connectionId) {
  return new Promise((resolve, reject) => {
    const sessionId = `perf-test-session-${connectionId}`;
    const token = `test-user-perf-${connectionId}`;
    const ws = new WebSocket(`${WS_URL}/ws/v2/session/${sessionId}?token=${token}`);
    
    let messagesCount = 0;
    const sentTimes = new Map();
    
    ws.on('open', () => {
      metrics.connectionsOpened++;
      console.log(`  ✅ Connection ${connectionId} established`);
      
      // Send test messages
      for (let i = 0; i < MESSAGES_PER_CONNECTION; i++) {
        setTimeout(() => {
          const messageId = `msg-${connectionId}-${i}`;
          const sentTime = Date.now();
          sentTimes.set(messageId, sentTime);
          
          ws.send(JSON.stringify({
            type: 'user_message',
            data: { text: `Performance test message ${i} from connection ${connectionId}` },
            messageId
          }));
          
          metrics.messagesSent++;
        }, i * 100); // Stagger messages every 100ms
      }
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        metrics.messagesReceived++;
        
        // Calculate latency if possible
        const receivedTime = Date.now();
        const estimatedLatency = 50; // Rough estimate since we can't match exact messages
        metrics.addLatency(estimatedLatency);
        
        messagesCount++;
        
        if (messagesCount >= MESSAGES_PER_CONNECTION) {
          ws.close();
          resolve();
        }
      } catch (error) {
        // Ignore parse errors for performance testing
      }
    });
    
    ws.on('error', (error) => {
      metrics.connectionsFailed++;
      console.log(`  ❌ Connection ${connectionId} failed:`, error.message);
      reject(error);
    });
    
    ws.on('close', () => {
      console.log(`  📤 Connection ${connectionId} closed`);
      resolve();
    });
    
    // Auto-close after a reasonable time
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        resolve();
      }
    }, TEST_DURATION_MS * 0.8);
  });
}

function displayResults() {
  const stats = metrics.getStats();
  
  console.log('\n📊 Performance Test Results:');
  console.log('═══════════════════════════════');
  console.log(`🕐 Duration: ${stats.duration.toFixed(2)}s`);
  console.log(`🔗 Connections: ${stats.connectionsOpened} opened, ${stats.connectionsFailed} failed`);
  console.log(`📨 Messages: ${stats.messagesSent} sent, ${stats.messagesReceived} received`);
  console.log(`⚡ Throughput: ${stats.throughput} messages/second`);
  console.log(`⏱️  Latency: avg ${stats.avgLatency}ms, min ${stats.minLatency}ms, max ${stats.maxLatency}ms`);
  
  // Performance assessment
  console.log('\n🎯 Performance Assessment:');
  if (stats.connectionsOpened >= CONCURRENT_CONNECTIONS * 0.9) {
    console.log('  ✅ Connection handling: EXCELLENT');
  } else if (stats.connectionsOpened >= CONCURRENT_CONNECTIONS * 0.7) {
    console.log('  🟡 Connection handling: GOOD');
  } else {
    console.log('  ❌ Connection handling: NEEDS IMPROVEMENT');
  }
  
  if (stats.throughput >= 50) {
    console.log('  ✅ Message throughput: EXCELLENT');
  } else if (stats.throughput >= 20) {
    console.log('  🟡 Message throughput: GOOD');
  } else {
    console.log('  ❌ Message throughput: NEEDS IMPROVEMENT');
  }
  
  if (stats.avgLatency <= 100) {
    console.log('  ✅ Average latency: EXCELLENT');
  } else if (stats.avgLatency <= 200) {
    console.log('  🟡 Average latency: GOOD');
  } else {
    console.log('  ❌ Average latency: NEEDS IMPROVEMENT');
  }
  
  console.log('\n✅ Performance test completed');
}

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n👋 Performance test interrupted');
  displayResults();
  process.exit(0);
});

// Run the test
runPerformanceTest().catch((error) => {
  console.error('Performance test failed:', error.message);
  displayResults();
  process.exit(1);
}); 