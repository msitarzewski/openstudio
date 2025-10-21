/**
 * Quick WebSocket ping/pong test
 */

import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:6736');

ws.on('open', () => {
  console.log('✓ Connected to WebSocket server');

  // Send ping message
  console.log('→ Sending ping...');
  ws.send(JSON.stringify({ type: 'ping' }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('← Received:', message);

  if (message.type === 'pong') {
    console.log('✓ Ping/pong successful!');
    console.log('  Timestamp:', message.timestamp);
    ws.close();
    process.exit(0);
  }
});

ws.on('close', () => {
  console.log('Connection closed');
});

ws.on('error', (error) => {
  console.error('✗ WebSocket error:', error.message);
  process.exit(1);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('✗ Test timeout');
  process.exit(1);
}, 5000);
