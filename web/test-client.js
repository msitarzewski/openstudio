/**
 * Simple WebSocket test client for signaling server
 * Tests the complete flow: register → create-room → join-room
 */

import WebSocket from 'ws';

const SIGNALING_URL = 'ws://localhost:6736';

function createTestClient(name, peerId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(SIGNALING_URL);
    const client = { name, peerId, ws, messages: [] };

    ws.on('open', () => {
      console.log(`[${name}] Connected`);

      // Register
      ws.send(JSON.stringify({
        type: 'register',
        peerId: peerId
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log(`[${name}] Received:`, message);
      client.messages.push(message);
    });

    ws.on('close', () => {
      console.log(`[${name}] Disconnected`);
    });

    ws.on('error', (error) => {
      console.error(`[${name}] Error:`, error.message);
    });

    // Wait for connection
    setTimeout(() => resolve(client), 500);
  });
}

function sendMessage(client, message) {
  console.log(`[${client.name}] Sending:`, message);
  client.ws.send(JSON.stringify(message));
}

async function runTest() {
  console.log('=== WebSocket Signaling Test ===\n');

  // Create two clients
  const clientA = await createTestClient('Client A', 'peer-a-test');
  const clientB = await createTestClient('Client B', 'peer-b-test');

  // Wait for registration
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- Test 1: Create Room ---');
  sendMessage(clientA, { type: 'create-room' });
  await new Promise(resolve => setTimeout(resolve, 500));

  // Get room ID from response
  const roomCreated = clientA.messages.find(m => m.type === 'room-created');
  if (!roomCreated) {
    console.error('❌ Room creation failed');
    process.exit(1);
  }
  console.log(`✅ Room created: ${roomCreated.roomId}`);

  console.log('\n--- Test 2: Join Room ---');
  sendMessage(clientB, { type: 'join-room', roomId: roomCreated.roomId });
  await new Promise(resolve => setTimeout(resolve, 500));

  const roomJoined = clientB.messages.find(m => m.type === 'room-joined');
  if (!roomJoined) {
    console.error('❌ Room join failed');
    process.exit(1);
  }
  console.log(`✅ Room joined: ${roomJoined.roomId}`);
  console.log(`   Participants: ${JSON.stringify(roomJoined.participants)}`);

  // Check if Client A got peer-joined notification
  const peerJoined = clientA.messages.find(m => m.type === 'peer-joined');
  if (!peerJoined) {
    console.error('❌ peer-joined notification not received');
    process.exit(1);
  }
  console.log(`✅ Client A received peer-joined: ${peerJoined.peerId}`);

  console.log('\n--- Test 3: SDP Offer/Answer Exchange ---');
  sendMessage(clientA, {
    type: 'offer',
    from: 'peer-a-test',
    to: 'peer-b-test',
    sdp: { type: 'offer', sdp: 'mock-sdp-offer' }
  });
  await new Promise(resolve => setTimeout(resolve, 200));

  const offerReceived = clientB.messages.find(m => m.type === 'offer');
  if (!offerReceived) {
    console.error('❌ Offer not received');
    process.exit(1);
  }
  console.log(`✅ Client B received offer from: ${offerReceived.from}`);

  sendMessage(clientB, {
    type: 'answer',
    from: 'peer-b-test',
    to: 'peer-a-test',
    sdp: { type: 'answer', sdp: 'mock-sdp-answer' }
  });
  await new Promise(resolve => setTimeout(resolve, 200));

  const answerReceived = clientA.messages.find(m => m.type === 'answer');
  if (!answerReceived) {
    console.error('❌ Answer not received');
    process.exit(1);
  }
  console.log(`✅ Client A received answer from: ${answerReceived.from}`);

  console.log('\n--- Test 4: ICE Candidate Exchange ---');
  sendMessage(clientA, {
    type: 'ice-candidate',
    from: 'peer-a-test',
    to: 'peer-b-test',
    candidate: { candidate: 'mock-ice-candidate', sdpMid: '0', sdpMLineIndex: 0 }
  });
  await new Promise(resolve => setTimeout(resolve, 200));

  const iceReceived = clientB.messages.find(m => m.type === 'ice-candidate');
  if (!iceReceived) {
    console.error('❌ ICE candidate not received');
    process.exit(1);
  }
  console.log(`✅ Client B received ICE candidate from: ${iceReceived.from}`);

  console.log('\n--- Test 5: Disconnect and Cleanup ---');
  clientB.ws.close();
  await new Promise(resolve => setTimeout(resolve, 500));

  const peerLeft = clientA.messages.find(m => m.type === 'peer-left');
  if (!peerLeft) {
    console.error('❌ peer-left notification not received');
    process.exit(1);
  }
  console.log(`✅ Client A received peer-left: ${peerLeft.peerId}`);

  // Cleanup
  clientA.ws.close();

  console.log('\n=== All Tests Passed ✅ ===');
  process.exit(0);
}

runTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
