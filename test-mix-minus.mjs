/**
 * test-mix-minus.mjs
 * Automated test for mix-minus bus functionality
 *
 * Tests:
 * - 3 peers (A, B, C) connect to a room
 * - Each peer has mix-minus buses created automatically
 * - Mix-minus buses exclude the participant's own audio
 * - Audio graph structure is correct
 */

import { chromium } from 'playwright';

const WEB_SERVER_URL = 'http://localhost:8086';
const TEST_TIMEOUT = 45000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createBrowser(name) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream', // Auto-grant mic permissions
      '--use-fake-device-for-media-stream', // Use fake audio device
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  const page = await context.newPage();

  // Enable console logging for errors
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      console.log(`[${name}] ERROR: ${msg.text()}`);
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

async function getAudioGraphInfo(page) {
  return await page.evaluate(() => {
    if (!window.audioGraph) {
      return { error: 'audioGraph not found' };
    }
    return window.audioGraph.getGraphInfo();
  });
}

async function waitForMixMinusCount(page, expectedCount, timeout = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const info = await getAudioGraphInfo(page);
    const currentCount = info.mixMinus ? info.mixMinus.count : 0;
    if (currentCount === expectedCount) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function runTest() {
  console.log('='.repeat(80));
  console.log('Mix-Minus Bus Test');
  console.log('='.repeat(80));

  let peerA, peerB, peerC;

  try {
    // Launch 3 browser instances
    console.log('\n--- Launching browsers ---');
    peerA = await createBrowser('A');
    peerB = await createBrowser('B');
    peerC = await createBrowser('C');
    console.log('✅ Three browser instances created\n');

    // ===== Peer A: Create room =====
    console.log('--- Peer A: Creating room ---');
    await peerA.page.goto(WEB_SERVER_URL);

    // Wait for connection to signaling server
    console.log('[A] Waiting for connection...');
    const aConnected = await waitForStatus(peerA.page, 'Connected');
    if (!aConnected) {
      throw new Error('A failed to connect to signaling server');
    }
    console.log('✅ [A] Connected to signaling server');

    // Override dialogs to auto-create room
    await peerA.page.evaluate(() => {
      window.confirm = () => true; // Auto-confirm create room
      window.prompt = () => null;
      window.alert = () => {};
    });

    // Click Start Session (auto-creates room)
    console.log('[A] Clicking Start Session button...');
    await peerA.page.click('#start-session');
    await sleep(3000); // Wait for room creation and audio initialization

    // Debug: Check URL
    const currentUrl = peerA.page.url();
    console.log(`[A] Current URL: ${currentUrl}`);

    // Get room ID
    const roomId = await getRoomIdFromUrl(peerA.page);
    if (!roomId) {
      // Try to get more info about what happened
      const pageContent = await peerA.page.evaluate(() => {
        return {
          url: window.location.href,
          hash: window.location.hash,
          hasApp: window.app !== undefined,
          appState: window.app ? {
            peerId: window.app.peerId,
            roomId: window.app.roomId,
            inRoom: window.app.inRoom
          } : null
        };
      });
      console.log('[A] Page state:', JSON.stringify(pageContent, null, 2));
      throw new Error('Room ID not found in URL');
    }
    console.log(`✅ [A] Room created: ${roomId.substring(0, 8)}...`);

    // Check A's audio graph (should have 0 mix-minus buses - alone)
    await sleep(1000);
    const initialInfoA = await getAudioGraphInfo(peerA.page);
    console.log(`[A] Mix-minus count: ${initialInfoA.mixMinus ? initialInfoA.mixMinus.count : 0}`);
    if (initialInfoA.mixMinus && initialInfoA.mixMinus.count !== 0) {
      throw new Error(`A should have 0 mix-minus buses when alone, got ${initialInfoA.mixMinus.count}`);
    }
    console.log('✅ [A] 0 mix-minus buses (correct - alone in room)\n');

    // ===== Peer B: Join room =====
    console.log('--- Peer B: Joining room ---');
    await peerB.page.goto(`${WEB_SERVER_URL}#${roomId}`);

    // Wait for connection
    console.log('[B] Waiting for connection...');
    const bConnected = await waitForStatus(peerB.page, 'Connected');
    if (!bConnected) {
      throw new Error('B failed to connect to signaling server');
    }
    console.log('✅ [B] Connected to signaling server');

    // Override dialogs
    await peerB.page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => null;
      window.alert = () => {};
    });

    // Click Start Session (auto-joins room from URL hash)
    await peerB.page.click('#start-session');

    // Wait for mix-minus buses to be created
    console.log('[A] Waiting for mix-minus bus for B...');
    const aHasOne = await waitForMixMinusCount(peerA.page, 1, 10000);
    if (!aHasOne) {
      const infoA = await getAudioGraphInfo(peerA.page);
      throw new Error(`A should have 1 mix-minus bus, got ${infoA.mixMinus ? infoA.mixMinus.count : 0}`);
    }
    console.log('✅ [A] 1 mix-minus bus (for B)');

    console.log('[B] Waiting for mix-minus bus for A...');
    const bHasOne = await waitForMixMinusCount(peerB.page, 1, 10000);
    if (!bHasOne) {
      const infoB = await getAudioGraphInfo(peerB.page);
      throw new Error(`B should have 1 mix-minus bus, got ${infoB.mixMinus ? infoB.mixMinus.count : 0}`);
    }
    console.log('✅ [B] 1 mix-minus bus (for A)\n');

    // ===== Peer C: Join room =====
    console.log('--- Peer C: Joining room ---');
    await peerC.page.goto(`${WEB_SERVER_URL}#${roomId}`);

    // Wait for connection
    console.log('[C] Waiting for connection...');
    const cConnected = await waitForStatus(peerC.page, 'Connected');
    if (!cConnected) {
      throw new Error('C failed to connect to signaling server');
    }
    console.log('✅ [C] Connected to signaling server');

    // Override dialogs
    await peerC.page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => null;
      window.alert = () => {};
    });

    // Click Start Session
    await peerC.page.click('#start-session');

    // Wait for all mix-minus buses to be created
    console.log('[A] Waiting for 2 mix-minus buses (B and C)...');
    const aHasTwo = await waitForMixMinusCount(peerA.page, 2, 15000);
    if (!aHasTwo) {
      const infoA = await getAudioGraphInfo(peerA.page);
      throw new Error(`A should have 2 mix-minus buses, got ${infoA.mixMinus ? infoA.mixMinus.count : 0}`);
    }
    console.log('✅ [A] 2 mix-minus buses (for B and C)');

    console.log('[B] Waiting for 2 mix-minus buses (A and C)...');
    const bHasTwo = await waitForMixMinusCount(peerB.page, 2, 15000);
    if (!bHasTwo) {
      const infoB = await getAudioGraphInfo(peerB.page);
      throw new Error(`B should have 2 mix-minus buses, got ${infoB.mixMinus ? infoB.mixMinus.count : 0}`);
    }
    console.log('✅ [B] 2 mix-minus buses (for A and C)');

    console.log('[C] Waiting for 2 mix-minus buses (A and B)...');
    const cHasTwo = await waitForMixMinusCount(peerC.page, 2, 15000);
    if (!cHasTwo) {
      const infoC = await getAudioGraphInfo(peerC.page);
      throw new Error(`C should have 2 mix-minus buses, got ${infoC.mixMinus ? infoC.mixMinus.count : 0}`);
    }
    console.log('✅ [C] 2 mix-minus buses (for A and B)\n');

    // Get full info for verification
    const infoA = await getAudioGraphInfo(peerA.page);
    const infoB = await getAudioGraphInfo(peerB.page);
    const infoC = await getAudioGraphInfo(peerC.page);

    // ===== Verify Mix-Minus Configuration =====
    console.log('--- Verifying mix-minus configuration ---');

    // Check that each mix-minus bus has correct inverter and mixer gains
    for (const bus of infoA.mixMinus.buses) {
      if (bus.inverterGain !== -1) {
        throw new Error(`Inverter gain should be -1, got ${bus.inverterGain}`);
      }
      if (bus.mixerGain !== 1) {
        throw new Error(`Mixer gain should be 1, got ${bus.mixerGain}`);
      }
      if (!bus.hasMediaStream) {
        throw new Error(`Mix-minus bus should have MediaStream`);
      }
    }
    console.log('✅ Mix-minus buses have correct configuration (inverter=-1, mixer=1, has MediaStream)');

    // Get peer IDs
    const peerIdA = await peerA.page.evaluate(() => window.app?.peerId);
    const peerIdB = await peerB.page.evaluate(() => window.app?.peerId);
    const peerIdC = await peerC.page.evaluate(() => window.app?.peerId);

    console.log(`Peer IDs: A=${peerIdA?.substring(0, 8)}..., B=${peerIdB?.substring(0, 8)}..., C=${peerIdC?.substring(0, 8)}...`);

    // Verify A's mix-minus buses exclude A
    const aMixMinusPeerIds = infoA.mixMinus.buses.map(b => b.peerId);
    if (aMixMinusPeerIds.includes(peerIdA)) {
      throw new Error('A should not have mix-minus bus for itself');
    }
    if (!aMixMinusPeerIds.includes(peerIdB) || !aMixMinusPeerIds.includes(peerIdC)) {
      throw new Error('A should have mix-minus buses for B and C');
    }
    console.log('✅ A has correct mix-minus buses (excludes self, includes B and C)');

    // Verify B's mix-minus buses exclude B
    const bMixMinusPeerIds = infoB.mixMinus.buses.map(b => b.peerId);
    if (bMixMinusPeerIds.includes(peerIdB)) {
      throw new Error('B should not have mix-minus bus for itself');
    }
    if (!bMixMinusPeerIds.includes(peerIdA) || !bMixMinusPeerIds.includes(peerIdC)) {
      throw new Error('B should have mix-minus buses for A and C');
    }
    console.log('✅ B has correct mix-minus buses (excludes self, includes A and C)');

    // Verify C's mix-minus buses exclude C
    const cMixMinusPeerIds = infoC.mixMinus.buses.map(b => b.peerId);
    if (cMixMinusPeerIds.includes(peerIdC)) {
      throw new Error('C should not have mix-minus bus for itself');
    }
    if (!cMixMinusPeerIds.includes(peerIdA) || !cMixMinusPeerIds.includes(peerIdB)) {
      throw new Error('C should have mix-minus buses for A and B');
    }
    console.log('✅ C has correct mix-minus buses (excludes self, includes A and B)\n');

    console.log('='.repeat(80));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (peerA) await peerA.browser.close();
    if (peerB) await peerB.browser.close();
    if (peerC) await peerC.browser.close();
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
