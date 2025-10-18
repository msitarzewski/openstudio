/**
 * Test script for room management system
 *
 * Tests:
 * 1. Create room - verify room ID returned
 * 2. Join room - verify participant list and peer-joined broadcast
 * 3. Multiple participants join - verify all get notifications
 * 4. Participant disconnects - verify peer-left broadcast
 * 5. Last participant leaves - verify room deleted
 * 6. Join non-existent room - verify error
 * 7. Duplicate room creation - verify each gets unique ID
 * 8. Peer already in room cannot join another
 */

import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:3000';
const TIMEOUT = 5000; // 5 second timeout per test

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Utility: Create WebSocket connection and wait for it to be ready
async function createConnection() {
  const ws = new WebSocket(SERVER_URL);

  // Set up message listener immediately (before connection opens)
  const welcomePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for welcome message'));
    }, TIMEOUT);

    function messageHandler(data) {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'welcome') {
          clearTimeout(timeout);
          ws.off('message', messageHandler);
          resolve(message);
        }
      } catch (error) {
        // Ignore parse errors, wait for next message
      }
    }

    ws.on('message', messageHandler);
  });

  // Wait for connection to open
  await new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, TIMEOUT);

    ws.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });

    ws.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  // Wait for welcome message
  await welcomePromise;

  return ws;
}

// Utility: Wait for specific message type
function waitForMessage(ws, expectedType, timeoutMs = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${expectedType}`));
    }, timeoutMs);

    function messageHandler(data) {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === expectedType) {
          clearTimeout(timeout);
          ws.off('message', messageHandler);
          resolve(message);
        }
      } catch (error) {
        // Ignore parse errors, wait for next message
      }
    }

    ws.on('message', messageHandler);
  });
}

// Utility: Send message and wait for response
function sendAndWaitFor(ws, message, expectedType) {
  const promise = waitForMessage(ws, expectedType);
  ws.send(JSON.stringify(message));
  return promise;
}

// Utility: Register peer
async function registerPeer(ws, peerId) {
  return await sendAndWaitFor(ws, {
    type: 'register',
    peerId: peerId
  }, 'registered');
}

// Test runner
async function runTest(name, testFn) {
  try {
    console.log(`\n🧪 TEST: ${name}`);
    await testFn();
    console.log(`✅ PASS: ${name}`);
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

// Test 1: Create room
async function testCreateRoom() {
  const ws = await createConnection();
  await registerPeer(ws, 'host-1');

  // Create room
  const response = await sendAndWaitFor(ws, {
    type: 'create-room'
  }, 'room-created');

  if (!response.roomId) {
    throw new Error('No roomId in response');
  }

  if (response.hostId !== 'host-1') {
    throw new Error('Host ID mismatch');
  }

  // Verify roomId is a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(response.roomId)) {
    throw new Error('Invalid room ID format (expected UUID)');
  }

  ws.close();
}

// Test 2: Join room
async function testJoinRoom() {
  const [host, caller] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  await Promise.all([
    registerPeer(host, 'host-2'),
    registerPeer(caller, 'caller-2')
  ]);

  // Host creates room
  const createResponse = await sendAndWaitFor(host, {
    type: 'create-room'
  }, 'room-created');

  const roomId = createResponse.roomId;

  // Set up listener for peer-joined on host
  const peerJoinedPromise = waitForMessage(host, 'peer-joined');

  // Caller joins room
  const joinResponse = await sendAndWaitFor(caller, {
    type: 'join-room',
    roomId: roomId
  }, 'room-joined');

  // Verify caller got participant list
  if (joinResponse.roomId !== roomId) {
    throw new Error('Room ID mismatch in join response');
  }

  if (!Array.isArray(joinResponse.participants)) {
    throw new Error('Participants not an array');
  }

  if (joinResponse.participants.length !== 2) {
    throw new Error(`Expected 2 participants, got ${joinResponse.participants.length}`);
  }

  // Verify host received peer-joined event
  const peerJoined = await peerJoinedPromise;
  if (peerJoined.peerId !== 'caller-2') {
    throw new Error('Peer joined event has wrong peerId');
  }

  if (peerJoined.role !== 'caller') {
    throw new Error('Peer joined event has wrong role');
  }

  host.close();
  caller.close();
}

// Test 3: Multiple participants join
async function testMultipleParticipants() {
  const [host, caller1, caller2] = await Promise.all([
    createConnection(),
    createConnection(),
    createConnection()
  ]);

  await Promise.all([
    registerPeer(host, 'host-3'),
    registerPeer(caller1, 'caller-3a'),
    registerPeer(caller2, 'caller-3b')
  ]);

  // Host creates room
  const createResponse = await sendAndWaitFor(host, {
    type: 'create-room'
  }, 'room-created');

  const roomId = createResponse.roomId;

  // First caller joins
  const peerJoined1Promise = waitForMessage(host, 'peer-joined');
  await sendAndWaitFor(caller1, {
    type: 'join-room',
    roomId: roomId
  }, 'room-joined');
  await peerJoined1Promise;

  // Second caller joins - both host AND caller1 should get peer-joined
  const [hostNotif, caller1Notif] = await Promise.all([
    waitForMessage(host, 'peer-joined'),
    waitForMessage(caller1, 'peer-joined'),
    sendAndWaitFor(caller2, {
      type: 'join-room',
      roomId: roomId
    }, 'room-joined')
  ]);

  if (hostNotif.peerId !== 'caller-3b') {
    throw new Error('Host did not receive correct peer-joined');
  }

  if (caller1Notif.peerId !== 'caller-3b') {
    throw new Error('Caller1 did not receive correct peer-joined');
  }

  host.close();
  caller1.close();
  caller2.close();
}

// Test 4: Participant disconnect triggers peer-left
async function testParticipantDisconnect() {
  const [host, caller] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  await Promise.all([
    registerPeer(host, 'host-4'),
    registerPeer(caller, 'caller-4')
  ]);

  // Create and join room
  const createResponse = await sendAndWaitFor(host, {
    type: 'create-room'
  }, 'room-created');

  await sendAndWaitFor(caller, {
    type: 'join-room',
    roomId: createResponse.roomId
  }, 'room-joined');

  // Wait for host's peer-joined notification
  await waitForMessage(host, 'peer-joined');

  // Set up listener for peer-left
  const peerLeftPromise = waitForMessage(host, 'peer-left');

  // Caller disconnects
  caller.close();

  // Host should receive peer-left
  const peerLeft = await peerLeftPromise;
  if (peerLeft.peerId !== 'caller-4') {
    throw new Error('Peer left event has wrong peerId');
  }

  host.close();
}

// Test 5: Last participant leaves - room should be deleted
async function testLastParticipantLeaves() {
  const ws = await createConnection();
  await registerPeer(ws, 'host-5');

  // Create room
  const createResponse = await sendAndWaitFor(ws, {
    type: 'create-room'
  }, 'room-created');

  const roomId = createResponse.roomId;

  // Disconnect (last participant leaves)
  ws.close();

  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 100));

  // Try to join the now-deleted room
  const newWs = await createConnection();
  await registerPeer(newWs, 'new-caller');

  const errorResponse = await sendAndWaitFor(newWs, {
    type: 'join-room',
    roomId: roomId
  }, 'error');

  if (!errorResponse.message.includes('does not exist')) {
    throw new Error('Expected error about room not existing');
  }

  newWs.close();
}

// Test 6: Join non-existent room
async function testJoinNonExistentRoom() {
  const ws = await createConnection();
  await registerPeer(ws, 'caller-6');

  const errorResponse = await sendAndWaitFor(ws, {
    type: 'join-room',
    roomId: 'fake-room-id-12345'
  }, 'error');

  if (!errorResponse.message.includes('does not exist')) {
    throw new Error('Expected error about room not existing');
  }

  ws.close();
}

// Test 7: Each create-room gets unique ID
async function testUniqueRoomIds() {
  const [host1, host2] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  await Promise.all([
    registerPeer(host1, 'host-7a'),
    registerPeer(host2, 'host-7b')
  ]);

  const [response1, response2] = await Promise.all([
    sendAndWaitFor(host1, { type: 'create-room' }, 'room-created'),
    sendAndWaitFor(host2, { type: 'create-room' }, 'room-created')
  ]);

  if (response1.roomId === response2.roomId) {
    throw new Error('Room IDs should be unique');
  }

  host1.close();
  host2.close();
}

// Test 8: Peer already in room cannot join another
async function testCannotJoinMultipleRooms() {
  const [host1, host2, caller] = await Promise.all([
    createConnection(),
    createConnection(),
    createConnection()
  ]);

  await Promise.all([
    registerPeer(host1, 'host-8a'),
    registerPeer(host2, 'host-8b'),
    registerPeer(caller, 'caller-8')
  ]);

  // Create two rooms
  const [room1, room2] = await Promise.all([
    sendAndWaitFor(host1, { type: 'create-room' }, 'room-created'),
    sendAndWaitFor(host2, { type: 'create-room' }, 'room-created')
  ]);

  // Caller joins room 1
  await sendAndWaitFor(caller, {
    type: 'join-room',
    roomId: room1.roomId
  }, 'room-joined');

  // Wait for peer-joined notification
  await waitForMessage(host1, 'peer-joined');

  // Try to join room 2 (should fail)
  const errorResponse = await sendAndWaitFor(caller, {
    type: 'join-room',
    roomId: room2.roomId
  }, 'error');

  if (!errorResponse.message.includes('already in room')) {
    throw new Error('Expected error about already being in a room');
  }

  host1.close();
  host2.close();
  caller.close();
}

// Test 9: Cannot create/join room without registering
async function testMustRegisterFirst() {
  const ws = await createConnection();

  // Try to create room without registering
  const createError = await sendAndWaitFor(ws, {
    type: 'create-room'
  }, 'error');

  if (!createError.message.includes('Must register')) {
    throw new Error('Expected error about needing to register');
  }

  ws.close();
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log('========================================');
  console.log('Room Management System Tests');
  console.log('========================================');

  await runTest('1. Create room', testCreateRoom);
  await runTest('2. Join room', testJoinRoom);
  await runTest('3. Multiple participants join', testMultipleParticipants);
  await runTest('4. Participant disconnect triggers peer-left', testParticipantDisconnect);
  await runTest('5. Last participant leaves - room deleted', testLastParticipantLeaves);
  await runTest('6. Join non-existent room', testJoinNonExistentRoom);
  await runTest('7. Each create-room gets unique ID', testUniqueRoomIds);
  await runTest('8. Peer already in room cannot join another', testCannotJoinMultipleRooms);
  await runTest('9. Cannot create/join room without registering', testMustRegisterFirst);

  // Print summary
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log(`Total: ${results.passed + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }

  console.log('========================================\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
