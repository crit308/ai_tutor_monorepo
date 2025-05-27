/**
 * Test script for whiteboard WebSocket functionality
 * 
 * This script tests:
 * - WebSocket connection to whiteboard endpoint
 * - Yjs document synchronization
 * - Content validation and sanitization
 * - Multiple client simulation
 */

const WebSocket = require('ws');
const Y = require('yjs');

// Test configuration
const WS_URL = 'ws://localhost:8080';
const TEST_SESSION_ID = 'test-session-123';
const TEST_TOKEN = 'test-jwt-token'; // Replace with valid JWT for real testing

/**
 * Create a test WebSocket connection to the whiteboard endpoint
 */
function createWhiteboardConnection(sessionId, token) {
    const url = `${WS_URL}/ws/v2/session/${sessionId}/whiteboard?token=${token}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    
    return new Promise((resolve, reject) => {
        const doc = new Y.Doc();
        let isConnected = false;
        
        ws.on('open', () => {
            console.log(`✅ Connected to whiteboard for session ${sessionId}`);
            isConnected = true;
            resolve({ ws, doc });
        });
        
        ws.on('message', (data) => {
            if (data instanceof ArrayBuffer || Buffer.isBuffer(data)) {
                // Apply Yjs update from server
                const update = new Uint8Array(data);
                Y.applyUpdate(doc, update, 'remote');
                console.log(`📥 Received Yjs update (${update.length} bytes)`);
            } else {
                console.log(`📥 Received message: ${data}`);
            }
        });
        
        ws.on('error', (error) => {
            console.error(`❌ WebSocket error: ${error.message}`);
            if (!isConnected) reject(error);
        });
        
        ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed: ${code} ${reason}`);
        });
        
        // Set up Yjs document to send updates to server
        doc.on('update', (update, origin) => {
            if (origin === 'remote') return; // Don't echo remote updates
            
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(update);
                console.log(`📤 Sent Yjs update (${update.length} bytes)`);
            }
        });
    });
}

/**
 * Test basic whiteboard functionality
 */
async function testBasicWhiteboard() {
    console.log('\n🧪 Testing basic whiteboard functionality...');
    
    try {
        const { ws, doc } = await createWhiteboardConnection(TEST_SESSION_ID, TEST_TOKEN);
        
        // Wait a moment for initial state
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Add some test objects to the whiteboard
        const objectsMap = doc.getMap('objects');
        
        // Add a test object
        const testObject = {
            id: 'test-object-1',
            type: 'rectangle',
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            metadata: {
                source: 'user',
                timestamp: Date.now()
            }
        };
        
        objectsMap.set('test-object-1', testObject);
        console.log('✅ Added test object to whiteboard');
        
        // Wait for synchronization
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify the object exists
        const retrievedObject = objectsMap.get('test-object-1');
        if (retrievedObject && retrievedObject.id === 'test-object-1') {
            console.log('✅ Object successfully synchronized');
        } else {
            console.log('❌ Object synchronization failed');
        }
        
        ws.close();
        
    } catch (error) {
        console.error(`❌ Basic whiteboard test failed: ${error.message}`);
    }
}

/**
 * Test content validation (malicious source field)
 */
async function testContentValidation() {
    console.log('\n🧪 Testing content validation...');
    
    try {
        const { ws, doc } = await createWhiteboardConnection(TEST_SESSION_ID, TEST_TOKEN);
        
        // Wait a moment for initial state
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const objectsMap = doc.getMap('objects');
        
        // Try to add an object with invalid source (should be sanitized)
        const maliciousObject = {
            id: 'malicious-object',
            type: 'text',
            content: 'This should be sanitized',
            metadata: {
                source: 'assistant', // This should be changed to 'user'
                timestamp: Date.now()
            }
        };
        
        objectsMap.set('malicious-object', maliciousObject);
        console.log('📤 Sent object with invalid source field');
        
        // Wait for server processing and validation
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if the source was sanitized
        const sanitizedObject = objectsMap.get('malicious-object');
        if (sanitizedObject && sanitizedObject.metadata.source === 'user') {
            console.log('✅ Content validation working - source field sanitized');
        } else {
            console.log('❌ Content validation failed - source field not sanitized');
        }
        
        ws.close();
        
    } catch (error) {
        console.error(`❌ Content validation test failed: ${error.message}`);
    }
}

/**
 * Test ephemeral objects
 */
async function testEphemeralObjects() {
    console.log('\n🧪 Testing ephemeral objects...');
    
    try {
        const { ws, doc } = await createWhiteboardConnection(TEST_SESSION_ID, TEST_TOKEN);
        
        // Wait a moment for initial state
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const ephemeralMap = doc.getMap('ephemeral');
        
        // Add an ephemeral object that expires quickly
        const ephemeralObject = {
            id: 'ephemeral-cursor',
            type: 'cursor',
            x: 250,
            y: 300,
            metadata: {
                source: 'user',
                expiresAt: Date.now() + 2000 // Expires in 2 seconds
            }
        };
        
        ephemeralMap.set('ephemeral-cursor', ephemeralObject);
        console.log('📤 Added ephemeral object (expires in 2s)');
        
        // Wait for expiration + GC cycle
        await new Promise(resolve => setTimeout(resolve, 12000)); // Wait 12 seconds
        
        // Check if object was garbage collected
        const expiredObject = ephemeralMap.get('ephemeral-cursor');
        if (!expiredObject) {
            console.log('✅ Ephemeral GC working - expired object removed');
        } else {
            console.log('❌ Ephemeral GC failed - expired object still exists');
        }
        
        ws.close();
        
    } catch (error) {
        console.error(`❌ Ephemeral objects test failed: ${error.message}`);
    }
}

/**
 * Test multiple clients
 */
async function testMultipleClients() {
    console.log('\n🧪 Testing multiple clients...');
    
    try {
        // Create two clients
        const client1 = await createWhiteboardConnection(TEST_SESSION_ID, TEST_TOKEN);
        const client2 = await createWhiteboardConnection(TEST_SESSION_ID, TEST_TOKEN);
        
        // Wait for connections to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Client 1 adds an object
        const objectsMap1 = client1.doc.getMap('objects');
        const sharedObject = {
            id: 'shared-object',
            type: 'circle',
            x: 300,
            y: 200,
            radius: 50,
            metadata: {
                source: 'user',
                timestamp: Date.now()
            }
        };
        
        objectsMap1.set('shared-object', sharedObject);
        console.log('📤 Client 1 added shared object');
        
        // Wait for synchronization
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Check if Client 2 received the object
        const objectsMap2 = client2.doc.getMap('objects');
        const receivedObject = objectsMap2.get('shared-object');
        
        if (receivedObject && receivedObject.id === 'shared-object') {
            console.log('✅ Multi-client synchronization working');
        } else {
            console.log('❌ Multi-client synchronization failed');
        }
        
        client1.ws.close();
        client2.ws.close();
        
    } catch (error) {
        console.error(`❌ Multiple clients test failed: ${error.message}`);
    }
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('🚀 Starting whiteboard WebSocket tests...');
    console.log(`📡 Testing against: ${WS_URL}`);
    console.log(`🎯 Session ID: ${TEST_SESSION_ID}`);
    console.log('\n⚠️  Note: These tests require a running WebSocket server');
    console.log('   Start the server with: node wsServer.js');
    
    await testBasicWhiteboard();
    await testContentValidation();
    await testEphemeralObjects();
    await testMultipleClients();
    
    console.log('\n🏁 All tests completed!');
}

// Run tests if this script is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = {
    createWhiteboardConnection,
    testBasicWhiteboard,
    testContentValidation,
    testEphemeralObjects,
    testMultipleClients,
    runTests
}; 