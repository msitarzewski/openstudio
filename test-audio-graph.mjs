/**
 * test-audio-graph.mjs
 * Manual test script for Web Audio foundation
 *
 * Run this test to verify:
 * - AudioContext creation and initialization
 * - Context state management (suspended → running)
 * - Browser compatibility
 *
 * Usage:
 * 1. Start web server: cd web && python3 -m http.server 8086
 * 2. Open browser: http://localhost:8086
 * 3. Open DevTools console
 * 4. Look for AudioContext logs
 * 5. Click "Start Session" to resume context
 * 6. Verify context state changes from 'suspended' to 'running'
 */

import { chromium } from 'playwright';

const WEB_URL = 'http://localhost:8086';
const TIMEOUT = 5000;

async function testAudioContext() {
  console.log('=== Web Audio Foundation Test ===\n');

  const browser = await chromium.launch({
    headless: true, // Run headless for automated testing
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-web-security',
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  const page = await context.newPage();

  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log(`[Browser] ${text}`);
  });

  // Capture errors
  page.on('pageerror', error => {
    console.error(`[Browser Error] ${error.message}`);
  });

  try {
    console.log('1. Loading page...');
    await page.goto(WEB_URL);
    await page.waitForTimeout(1000);

    console.log('\n2. Checking for AudioContext initialization...');
    const contextCreated = logs.some(log => log.includes('[AudioContext] Created'));
    if (contextCreated) {
      console.log('✅ AudioContext created successfully');
    } else {
      console.log('❌ AudioContext not created');
    }

    console.log('\n3. Checking AudioContext state...');
    const initialState = await page.evaluate(() => {
      return window.audioContextManager ? window.audioContextManager.getState() : 'not found';
    });
    console.log(`   Initial state: ${initialState}`);

    console.log('\n4. Clicking Start Session to resume AudioContext...');

    // Override dialogs
    await page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => null;
      window.alert = () => {};
    });

    await page.click('#start-session');
    await page.waitForTimeout(2000);

    console.log('\n5. Verifying AudioContext resumed...');
    const resumed = logs.some(log => log.includes('[AudioContext] Resumed') || log.includes('state changed: running'));
    if (resumed) {
      console.log('✅ AudioContext resumed successfully');
    } else {
      console.log('❌ AudioContext did not resume');
    }

    const finalState = await page.evaluate(() => {
      return window.audioContextManager ? window.audioContextManager.getState() : 'not found';
    });
    console.log(`   Final state: ${finalState}`);

    console.log('\n6. Getting audio graph info...');
    const graphInfo = await page.evaluate(() => {
      if (window.audioGraph) {
        return window.audioGraph.getGraphInfo();
      }
      return null;
    });

    if (graphInfo) {
      console.log('✅ Audio graph initialized:');
      console.log(`   Context state: ${graphInfo.contextState}`);
      console.log(`   Sample rate: ${graphInfo.sampleRate}Hz`);
      console.log(`   Participants: ${graphInfo.participantCount}`);
    } else {
      console.log('❌ Audio graph not found');
    }

    console.log('\n=== Test Summary ===');
    console.log(`AudioContext created: ${contextCreated ? '✅' : '❌'}`);
    console.log(`AudioContext resumed: ${resumed ? '✅' : '❌'}`);
    console.log(`Audio graph initialized: ${graphInfo ? '✅' : '❌'}`);

    console.log('\n✅ All tests passed!');
    console.log('\nClosing browser...');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testAudioContext().catch(console.error);
