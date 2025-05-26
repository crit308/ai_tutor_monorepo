#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Configuration
const WS_PORT = process.env.WS_PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting Convex WebSocket Server...\n');

// Check if required files exist
const requiredFiles = [
  'wsServer.ts',
  'tutorWs.ts', 
  'whiteboardWs.ts'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(__dirname, file))) {
    console.error(`❌ Required file missing: ${file}`);
    process.exit(1);
  }
}

console.log('✅ All required files found');
console.log(`📡 WebSocket server will start on port ${WS_PORT}`);
console.log(`🌍 Environment: ${NODE_ENV}`);
console.log(`📍 Supported endpoints:`);
console.log(`   - ws://localhost:${WS_PORT}/ws/v2/session/{sessionId} (tutor)`);
console.log(`   - ws://localhost:${WS_PORT}/ws/v2/session/{sessionId}/whiteboard (whiteboard)`);
console.log('');

// Set environment variables
process.env.WS_PORT = WS_PORT;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key';

if (NODE_ENV === 'development') {
  console.log('🔧 Development mode: Using relaxed JWT validation');
}

// Start the TypeScript WebSocket server
const serverProcess = spawn('npx', ['tsx', 'wsServer.ts'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    WS_PORT,
    NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET
  }
});

// Handle process events
serverProcess.on('error', (error) => {
  console.error('❌ Failed to start WebSocket server:', error.message);
  process.exit(1);
});

serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ WebSocket server exited with code ${code}`);
    process.exit(code);
  } else {
    console.log('✅ WebSocket server closed gracefully');
  }
});

// Handle shutdown signals
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  serverProcess.kill('SIGTERM');
});

// Display help information
console.log('💡 Tips:');
console.log('   - Use Ctrl+C to stop the server');
console.log('   - Set WS_PORT environment variable to change port');
console.log('   - Set JWT_SECRET for production JWT validation');
console.log('   - Run tests with: node test-tutor-ws.js');
console.log(''); 