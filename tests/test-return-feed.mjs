/**
 * test-return-feed.mjs
 * Automated test for return feed routing (Task 015)
 *
 * Tests:
 * - 2 peers (A, B) connect to a room
 * - Each peer receives TWO tracks: microphone + return feed
 * - Microphone track → audio graph
 * - Return feed track → direct playback
 * - Verify no self-echo (return feed excludes peer's own audio)
 */

import { chromium } from 'playwright';

const WEB_SERVER_URL = 'http://localhost:8086';
const TEST_TIMEOUT = 60000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createBrowser(name) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[${name}] ${type.toUpperCase()}: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.error(`[${name}] Page error: ${error.message}`);
  });

  return { browser, page, name };
}

async function waitForStatus(page, expectedText, timeout = 10000) {
  try {
    await page.waitForFunction(
      (text) => {
        const statusEl = document.getElementById('status');
        return statusEl && statusEl.textContent.includes(text);
      },
      expectedText,
      { timeout }
    );
    return true;
  } catch (error) {
    const actualStatus = await page.$eval('#status', el => el.textContent);
    console.error(`Timeout waiting for status "${expectedText}", actual: "${actualStatus}"`);
    return false;
  }
}

async function getRoomIdFromUrl(page) {
  const url = page.url();
  const match = url.match(/#(.+)$/);
  return match ? match[1] : null;
}

async function getReturnFeedInfo(page) {
  return await page.evaluate(() => {
    if (!window.returnFeedManager) {
      return { error: 'returnFeedManager not found' };
    }
    return window.returnFeedManager.getInfo();
  });
}

async function getAudioGraphInfo(page) {
  return await page.evaluate(() => {
    if (!window.audioGraph) {
      return { error: 'audioGraph not found' };
    }
    return window.audioGraph.getGraphInfo();
  });
}

async function getStreamCounts(page) {
  return await page.evaluate(() => {
    if (!window.app) {
      return { error: 'app not found' };
    }
    return {
      receivedMicrophones: window.app.receivedMicrophoneStreams.size,
      receivedReturnFeeds: window.app.receivedReturnFeeds.size
    };
  });
}

async function waitForReturnFeedCount(page, expectedCount, timeout = 15000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const info = await getReturnFeedInfo(page);
    const currentCount = info.count || 0;
    if (currentCount === expectedCount) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function runTest() {
  console.log('='.repeat(80));
  console.log('Return Feed Routing Test (Task 015)');
  console.log('='.repeat(80));

  let peerA, peerB;

  try {
    // Launch 2 browser instances
    console.log('\n--- Launching browsers ---');
    peerA = await createBrowser('A');
    peerB = await createBrowser('B');
    console.log('✅ Two browser instances created\n');

    // ===== Peer A: Create room =====
    console.log('--- Peer A: Creating room ---');
    await peerA.page.goto(WEB_SERVER_URL);

    console.log('[A] Waiting for connection...');
    const aConnected = await waitForStatus(peerA.page, 'Connected');
    if (!aConnected) {
      throw new Error('A failed to connect to signaling server');
    }
    console.log('✅ [A] Connected to signaling server');

    // Override dialogs
    await peerA.page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => null;
      window.alert = () => {};
    });

    console.log('[A] Clicking Start Session button...');
    await peerA.page.click('#start-session');
    await sleep(3000);

    const roomId = await getRoomIdFromUrl(peerA.page);
    if (!roomId) {
      throw new Error('Room ID not found in URL');
    }
    console.log(`✅ [A] Room created: ${roomId.substring(0, 8)}...\n`);

    // ===== Peer B: Join room =====
    console.log('--- Peer B: Joining room ---');
    await peerB.page.goto(`${WEB_SERVER_URL}#${roomId}`);

    console.log('[B] Waiting for connection...');
    const bConnected = await waitForStatus(peerB.page, 'Connected');
    if (!bConnected) {
      throw new Error('B failed to connect to signaling server');
    }
    console.log('✅ [B] Connected to signaling server');

    await peerB.page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => null;
      window.alert = () => {};
    });

    await peerB.page.click('#start-session');
    await sleep(2000);
    console.log('✅ [B] Session started\n');

    // ===== Wait for WebRTC connections to establish =====
    console.log('--- Waiting for WebRTC connections ---');
    await sleep(5000); // Allow time for initial connection + renegotiation

    // ===== Verify microphone streams in audio graph =====
    console.log('--- Verifying microphone streams ---');

    const audioGraphA = await getAudioGraphInfo(peerA.page);
    const audioGraphB = await getAudioGraphInfo(peerB.page);

    console.log(`[A] Audio graph participants: ${audioGraphA.participantCount}`);
    console.log(`[B] Audio graph participants: ${audioGraphB.participantCount}`);

    if (audioGraphA.participantCount !== 1) {
      throw new Error(`A should have 1 participant in audio graph (B's microphone), got ${audioGraphA.participantCount}`);
    }
    if (audioGraphB.participantCount !== 1) {
      throw new Error(`B should have 1 participant in audio graph (A's microphone), got ${audioGraphB.participantCount}`);
    }
    console.log('✅ Both peers have microphone streams in audio graph\n');

    // ===== Verify mix-minus streams created =====
    console.log('--- Verifying mix-minus streams ---');

    const mixMinusA = audioGraphA.mixMinus;
    const mixMinusB = audioGraphB.mixMinus;

    console.log(`[A] Mix-minus buses: ${mixMinusA ? mixMinusA.count : 0}`);
    console.log(`[B] Mix-minus buses: ${mixMinusB ? mixMinusB.count : 0}`);

    if (!mixMinusA || mixMinusA.count !== 1) {
      throw new Error(`A should have 1 mix-minus bus (for B), got ${mixMinusA ? mixMinusA.count : 0}`);
    }
    if (!mixMinusB || mixMinusB.count !== 1) {
      throw new Error(`B should have 1 mix-minus bus (for A), got ${mixMinusB ? mixMinusB.count : 0}`);
    }
    console.log('✅ Mix-minus buses created for both peers\n');

    // ===== Verify return feed playback =====
    console.log('--- Verifying return feed playback ---');

    // Wait for return feeds to start
    console.log('[A] Waiting for return feed from B...');
    const aHasReturnFeed = await waitForReturnFeedCount(peerA.page, 1, 15000);
    if (!aHasReturnFeed) {
      const returnFeedA = await getReturnFeedInfo(peerA.page);
      console.log('[A] Return feed info:', returnFeedA);
      throw new Error(`A should have 1 return feed playing, got ${returnFeedA.count || 0}`);
    }
    console.log('✅ [A] Return feed playing');

    console.log('[B] Waiting for return feed from A...');
    const bHasReturnFeed = await waitForReturnFeedCount(peerB.page, 1, 15000);
    if (!bHasReturnFeed) {
      const returnFeedB = await getReturnFeedInfo(peerB.page);
      console.log('[B] Return feed info:', returnFeedB);
      throw new Error(`B should have 1 return feed playing, got ${returnFeedB.count || 0}`);
    }
    console.log('✅ [B] Return feed playing\n');

    // ===== Verify stream counts =====
    console.log('--- Verifying stream tracking ---');

    const streamCountsA = await getStreamCounts(peerA.page);
    const streamCountsB = await getStreamCounts(peerB.page);

    console.log(`[A] Received microphones: ${streamCountsA.receivedMicrophones}, return feeds: ${streamCountsA.receivedReturnFeeds}`);
    console.log(`[B] Received microphones: ${streamCountsB.receivedMicrophones}, return feeds: ${streamCountsB.receivedReturnFeeds}`);

    if (streamCountsA.receivedMicrophones !== 1 || streamCountsA.receivedReturnFeeds !== 1) {
      throw new Error(`A should have received 1 microphone and 1 return feed, got mic=${streamCountsA.receivedMicrophones}, return=${streamCountsA.receivedReturnFeeds}`);
    }
    if (streamCountsB.receivedMicrophones !== 1 || streamCountsB.receivedReturnFeeds !== 1) {
      throw new Error(`B should have received 1 microphone and 1 return feed, got mic=${streamCountsB.receivedMicrophones}, return=${streamCountsB.receivedReturnFeeds}`);
    }
    console.log('✅ Both peers received 2 streams each (microphone + return feed)\n');

    // ===== Verify return feed configuration =====
    console.log('--- Verifying return feed configuration ---');

    const returnFeedA = await getReturnFeedInfo(peerA.page);
    const returnFeedB = await getReturnFeedInfo(peerB.page);

    // Check that return feeds have streams
    if (returnFeedA.feeds.length === 0 || !returnFeedA.feeds[0].hasStream) {
      throw new Error('A return feed missing stream');
    }
    if (returnFeedB.feeds.length === 0 || !returnFeedB.feeds[0].hasStream) {
      throw new Error('B return feed missing stream');
    }

    console.log('[A] Return feed volume:', returnFeedA.feeds[0].volume);
    console.log('[B] Return feed volume:', returnFeedB.feeds[0].volume);

    if (returnFeedA.feeds[0].volume !== 1.0) {
      throw new Error(`A return feed should have volume 1.0, got ${returnFeedA.feeds[0].volume}`);
    }
    if (returnFeedB.feeds[0].volume !== 1.0) {
      throw new Error(`B return feed should have volume 1.0, got ${returnFeedB.feeds[0].volume}`);
    }
    console.log('✅ Return feeds configured correctly (volume: 1.0, has stream)\n');

    // ===== Get peer IDs for verification =====
    const peerIdA = await peerA.page.evaluate(() => window.app?.peerId);
    const peerIdB = await peerB.page.evaluate(() => window.app?.peerId);

    console.log(`Peer IDs: A=${peerIdA?.substring(0, 8)}..., B=${peerIdB?.substring(0, 8)}...`);

    // ===== Verify mix-minus excludes correct peer =====
    console.log('--- Verifying mix-minus exclusion ---');

    const aMixMinusBuses = mixMinusA.buses.map(b => b.peerId);
    const bMixMinusBuses = mixMinusB.buses.map(b => b.peerId);

    console.log(`[A] Mix-minus bus for: ${aMixMinusBuses[0]?.substring(0, 8)}...`);
    console.log(`[B] Mix-minus bus for: ${bMixMinusBuses[0]?.substring(0, 8)}...`);

    if (!aMixMinusBuses.includes(peerIdB)) {
      throw new Error('A should have mix-minus bus for B');
    }
    if (aMixMinusBuses.includes(peerIdA)) {
      throw new Error('A should NOT have mix-minus bus for itself');
    }
    if (!bMixMinusBuses.includes(peerIdA)) {
      throw new Error('B should have mix-minus bus for A');
    }
    if (bMixMinusBuses.includes(peerIdB)) {
      throw new Error('B should NOT have mix-minus bus for itself');
    }
    console.log('✅ Mix-minus buses correctly exclude own peer ID\n');

    // ===== Summary =====
    console.log('='.repeat(80));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log('');
    console.log('Return Feed System Validated:');
    console.log('- Microphone tracks → Audio graph ✅');
    console.log('- Mix-minus buses created ✅');
    console.log('- Return feed tracks sent ✅');
    console.log('- Return feeds playing ✅');
    console.log('- No self-echo (mix-minus excludes own audio) ✅');
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (peerA) await peerA.browser.close();
    if (peerB) await peerB.browser.close();
  }
}

// Run test with timeout
const timeoutHandle = setTimeout(() => {
  console.error(`\n❌ TEST TIMEOUT after ${TEST_TIMEOUT}ms`);
  process.exit(1);
}, TEST_TIMEOUT);

runTest().finally(() => {
  clearTimeout(timeoutHandle);
});
