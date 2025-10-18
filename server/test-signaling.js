/**
 * Test script for WebSocket signaling protocol
 *
 * Tests:
 * 1. Peer registration
 * 2. Offer relay from peer A to peer B
 * 3. Answer relay from peer B to peer A
 * 4. ICE candidate relay
 * 5. Error cases (malformed messages, unregistered peers, duplicate IDs, spoofed from)
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

// Test 1: Peer registration
async function testPeerRegistration() {
  const ws = await createConnection();

  // Register peer
  const response = await sendAndWaitFor(ws, {
    type: 'register',
    peerId: 'test-peer-1'
  }, 'registered');

  if (response.peerId !== 'test-peer-1') {
    throw new Error('Peer ID mismatch in response');
  }

  ws.close();
}

// Test 2: Duplicate peer ID rejection
async function testDuplicatePeerIdRejection() {
  const [ws1, ws2] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  // Register first peer
  await sendAndWaitFor(ws1, {
    type: 'register',
    peerId: 'duplicate-test'
  }, 'registered');

  // Try to register second peer with same ID
  const errorResponse = await sendAndWaitFor(ws2, {
    type: 'register',
    peerId: 'duplicate-test'
  }, 'error');

  if (!errorResponse.message.includes('already registered')) {
    throw new Error('Expected error message about duplicate peer ID');
  }

  ws1.close();
  ws2.close();
}

// Test 3: Offer relay from peer A to peer B
async function testOfferRelay() {
  const [peerA, peerB] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  // Register both peers
  await Promise.all([
    sendAndWaitFor(peerA, { type: 'register', peerId: 'peer-a' }, 'registered'),
    sendAndWaitFor(peerB, { type: 'register', peerId: 'peer-b' }, 'registered')
  ]);

  // Send offer from A to B (peerB should receive it)
  const offerMessage = {
    type: 'offer',
    from: 'peer-a',
    to: 'peer-b',
    sdp: 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\n...'
  };

  // Set up listener on peerB before sending
  const receivedOfferPromise = waitForMessage(peerB, 'offer');
  peerA.send(JSON.stringify(offerMessage));
  const receivedOffer = await receivedOfferPromise;

  // Verify peer B received the exact offer
  if (receivedOffer.from !== 'peer-a') {
    throw new Error('Offer "from" field mismatch');
  }
  if (receivedOffer.to !== 'peer-b') {
    throw new Error('Offer "to" field mismatch');
  }
  if (receivedOffer.sdp !== offerMessage.sdp) {
    throw new Error('Offer SDP mismatch');
  }

  peerA.close();
  peerB.close();
}

// Test 4: Answer relay from peer B to peer A
async function testAnswerRelay() {
  const [peerA, peerB] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  // Register both peers
  await Promise.all([
    sendAndWaitFor(peerA, { type: 'register', peerId: 'peer-a' }, 'registered'),
    sendAndWaitFor(peerB, { type: 'register', peerId: 'peer-b' }, 'registered')
  ]);

  // Send answer from B to A (peerA should receive it)
  const answerMessage = {
    type: 'answer',
    from: 'peer-b',
    to: 'peer-a',
    sdp: 'v=0\r\no=- 789012 2 IN IP4 127.0.0.1\r\n...'
  };

  // Set up listener on peerA before sending
  const receivedAnswerPromise = waitForMessage(peerA, 'answer');
  peerB.send(JSON.stringify(answerMessage));
  const receivedAnswer = await receivedAnswerPromise;

  // Verify peer A received the exact answer
  if (receivedAnswer.from !== 'peer-b') {
    throw new Error('Answer "from" field mismatch');
  }
  if (receivedAnswer.to !== 'peer-a') {
    throw new Error('Answer "to" field mismatch');
  }
  if (receivedAnswer.sdp !== answerMessage.sdp) {
    throw new Error('Answer SDP mismatch');
  }

  peerA.close();
  peerB.close();
}

// Test 5: ICE candidate relay
async function testIceCandidateRelay() {
  const [peerA, peerB] = await Promise.all([
    createConnection(),
    createConnection()
  ]);

  // Register both peers
  await Promise.all([
    sendAndWaitFor(peerA, { type: 'register', peerId: 'peer-a' }, 'registered'),
    sendAndWaitFor(peerB, { type: 'register', peerId: 'peer-b' }, 'registered')
  ]);

  // Send ICE candidate from A to B (peerB should receive it)
  const candidateMessage = {
    type: 'ice-candidate',
    from: 'peer-a',
    to: 'peer-b',
    candidate: {
      candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host',
      sdpMLineIndex: 0,
      sdpMid: 'audio'
    }
  };

  // Set up listener on peerB before sending
  const receivedCandidatePromise = waitForMessage(peerB, 'ice-candidate');
  peerA.send(JSON.stringify(candidateMessage));
  const receivedCandidate = await receivedCandidatePromise;

  // Verify peer B received the candidate
  if (receivedCandidate.from !== 'peer-a') {
    throw new Error('Candidate "from" field mismatch');
  }
  if (receivedCandidate.to !== 'peer-b') {
    throw new Error('Candidate "to" field mismatch');
  }
  if (JSON.stringify(receivedCandidate.candidate) !== JSON.stringify(candidateMessage.candidate)) {
    throw new Error('Candidate data mismatch');
  }

  peerA.close();
  peerB.close();
}

// Test 6: Unregistered peer cannot send offer
async function testUnregisteredPeerRejection() {
  const ws = await createConnection();

  // Try to send offer without registering
  const errorResponse = await sendAndWaitFor(ws, {
    type: 'offer',
    from: 'peer-a',
    to: 'peer-b',
    sdp: 'v=0...'
  }, 'error');

  if (!errorResponse.message.includes('must register')) {
    throw new Error('Expected error about peer not being registered');
  }

  ws.close();
}

// Test 7: Target peer not found
async function testTargetPeerNotFound() {
  const peerA = await createConnection();

  // Register peer A
  await sendAndWaitFor(peerA, { type: 'register', peerId: 'peer-a' }, 'registered');

  // Send offer to non-existent peer
  const errorResponse = await sendAndWaitFor(peerA, {
    type: 'offer',
    from: 'peer-a',
    to: 'non-existent-peer',
    sdp: 'v=0...'
  }, 'error');

  if (!errorResponse.message.includes('not connected')) {
    throw new Error('Expected error about target peer not connected');
  }

  peerA.close();
}

// Test 8: Spoofed "from" field rejection
async function testSpoofedFromRejection() {
  const peerA = await createConnection();

  // Register peer A
  await sendAndWaitFor(peerA, { type: 'register', peerId: 'peer-a' }, 'registered');

  // Try to send offer with spoofed "from" field
  const errorResponse = await sendAndWaitFor(peerA, {
    type: 'offer',
    from: 'peer-b', // Spoofed!
    to: 'peer-c',
    sdp: 'v=0...'
  }, 'error');

  if (!errorResponse.message.includes('must match registered peer ID')) {
    throw new Error('Expected error about "from" field not matching peer ID');
  }

  peerA.close();
}

// Test 9: Malformed message (missing required fields)
async function testMalformedMessage() {
  const ws = await createConnection();

  // Register peer
  await sendAndWaitFor(ws, { type: 'register', peerId: 'peer-a' }, 'registered');

  // Send malformed offer (missing sdp)
  const errorResponse = await sendAndWaitFor(ws, {
    type: 'offer',
    from: 'peer-a',
    to: 'peer-b'
    // Missing: sdp
  }, 'error');

  if (!errorResponse.message.includes('sdp')) {
    throw new Error('Expected error about missing sdp field');
  }

  ws.close();
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log('========================================');
  console.log('WebSocket Signaling Protocol Tests');
  console.log('========================================');

  await runTest('1. Peer registration', testPeerRegistration);
  await runTest('2. Duplicate peer ID rejection', testDuplicatePeerIdRejection);
  await runTest('3. Offer relay from peer A to peer B', testOfferRelay);
  await runTest('4. Answer relay from peer B to peer A', testAnswerRelay);
  await runTest('5. ICE candidate relay', testIceCandidateRelay);
  await runTest('6. Unregistered peer cannot send offer', testUnregisteredPeerRejection);
  await runTest('7. Target peer not found error', testTargetPeerNotFound);
  await runTest('8. Spoofed "from" field rejection', testSpoofedFromRejection);
  await runTest('9. Malformed message rejection', testMalformedMessage);

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
