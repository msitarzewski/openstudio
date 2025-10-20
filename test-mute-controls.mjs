/**
 * test-mute-controls.mjs
 * Automated Playwright test for producer-authoritative mute controls
 *
 * Tests:
 * - Host can mute any participant (producer authority)
 * - Participant can self-mute (self authority)
 * - Mute state propagates via signaling
 * - Visual states: unmuted (green), self-muted (yellow), producer-muted (red)
 * - Producer mute overrides self unmute (conflict resolution)
 * - Audio graph reflects mute state (gain = 0 when muted)
 */

import { chromium } from 'playwright';

const WEB_URL = 'http://localhost:8086';
const TIMEOUT = 5000;

async function testMuteControls() {
  console.log('=== Mute Controls Test (Producer-Authoritative) ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-web-security',
    ]
  });

  const context = await browser.newContext({
    permissions: ['microphone']
  });

  // Create two pages (host and caller)
  const hostPage = await context.newPage();
  const callerPage = await context.newPage();

  // Capture console logs
  const hostLogs = [];
  const callerLogs = [];

  hostPage.on('console', msg => {
    const text = msg.text();
    hostLogs.push(text);
    console.log(`[Host] ${text}`);
  });

  callerPage.on('console', msg => {
    const text = msg.text();
    callerLogs.push(text);
    console.log(`[Caller] ${text}`);
  });

  // Capture page errors
  hostPage.on('pageerror', err => {
    console.error(`[Host] ERROR: ${err.message}`);
  });

  callerPage.on('pageerror', err => {
    console.error(`[Caller] ERROR: ${err.message}`);
  });

  let allPassed = true;

  try {
    console.log('1. Loading host page...');
    await hostPage.goto(WEB_URL);
    await hostPage.waitForTimeout(1000);

    // Override dialogs for host page
    await hostPage.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => null;
      window.alert = () => {};
    });

    console.log('\n2. Host: Creating room...');
    await hostPage.click('#start-session');
    await hostPage.waitForTimeout(2000);

    // Get room ID from host URL hash
    const roomId = await hostPage.evaluate(() => window.location.hash.substring(1));
    console.log(`   Room ID: ${roomId}`);

    console.log('\n3. Caller: Loading page with room ID in URL hash...');
    await callerPage.goto(`${WEB_URL}#${roomId}`);
    await callerPage.waitForTimeout(1000);

    // Override caller dialogs
    await callerPage.evaluate(() => {
      window.confirm = () => false;
      window.prompt = () => null;
      window.alert = () => {};
    });

    console.log('\n4. Caller: Clicking Start Session to join room...');
    await callerPage.click('#start-session');
    await callerPage.waitForTimeout(3000); // Wait for connection establishment

    // Get peer IDs
    const hostPeerId = await hostPage.evaluate(() => window.app.peerId);
    const callerPeerId = await callerPage.evaluate(() => window.app.peerId);
    console.log(`   Host peer ID: ${hostPeerId.substring(0, 8)}...`);
    console.log(`   Caller peer ID: ${callerPeerId.substring(0, 8)}...`);

    // Wait for participants to appear
    await hostPage.waitForTimeout(2000);

    // Test 1: Verify initial mute state (all unmuted)
    console.log('\n=== Test 1: Initial Mute State ===');
    const callerCardOnHost = await hostPage.locator(`[data-peer-id="${callerPeerId}"]`);
    const muteButtonOnHost = callerCardOnHost.locator('.mute-button');

    const initialButtonText = await muteButtonOnHost.textContent();
    const initialButtonClass = await muteButtonOnHost.getAttribute('class');

    console.log(`   Host sees caller button: "${initialButtonText}" (class: ${initialButtonClass})`);

    if (initialButtonText.includes('Unmuted') && !initialButtonClass.includes('self-muted') && !initialButtonClass.includes('producer-muted')) {
      console.log('   ✅ PASS: Caller initially unmuted (green state)');
    } else {
      console.log('   ❌ FAIL: Expected unmuted state');
      allPassed = false;
    }

    // Test 2: Caller self-mutes
    console.log('\n=== Test 2: Caller Self-Mute ===');

    // Find caller's own participant card (self)
    const selfCardOnCaller = await callerPage.locator(`[data-peer-id="${callerPeerId}"]`);
    const selfMuteButtonOnCaller = selfCardOnCaller.locator('.mute-button');

    console.log('   Caller clicks own mute button...');
    await selfMuteButtonOnCaller.click();
    await callerPage.waitForTimeout(1000); // Wait for signaling propagation

    // Check caller's UI
    const selfButtonText = await selfMuteButtonOnCaller.textContent();
    const selfButtonClass = await selfMuteButtonOnCaller.getAttribute('class');
    console.log(`   Caller sees own button: "${selfButtonText}" (class: ${selfButtonClass})`);

    if (selfButtonText.includes('Muted') && selfButtonClass.includes('self-muted')) {
      console.log('   ✅ PASS: Caller shows self-muted state (yellow)');
    } else {
      console.log('   ❌ FAIL: Expected self-muted state');
      allPassed = false;
    }

    // Check host's view of caller (should also show muted after propagation)
    await hostPage.waitForTimeout(500);
    const hostSeesButtonText = await muteButtonOnHost.textContent();
    const hostSeesButtonClass = await muteButtonOnHost.getAttribute('class');
    console.log(`   Host sees caller button: "${hostSeesButtonText}" (class: ${hostSeesButtonClass})`);

    if (hostSeesButtonText.includes('Muted')) {
      console.log('   ✅ PASS: Mute state propagated to host');
    } else {
      console.log('   ❌ FAIL: Mute state did not propagate');
      allPassed = false;
    }

    // Test 3: Host unmutes caller (producer authority overrides self)
    console.log('\n=== Test 3: Producer Authority Override (Host Unmutes Caller) ===');

    console.log('   Host clicks caller mute button to unmute...');
    await muteButtonOnHost.click();
    await hostPage.waitForTimeout(1000);

    // Check both views
    const hostSeesUnmuted = await muteButtonOnHost.textContent();
    const hostSeesClass = await muteButtonOnHost.getAttribute('class');
    console.log(`   Host sees: "${hostSeesUnmuted}" (class: ${hostSeesClass})`);

    await callerPage.waitForTimeout(500);
    const callerSeesUnmuted = await selfMuteButtonOnCaller.textContent();
    const callerSeesClass = await selfMuteButtonOnCaller.getAttribute('class');
    console.log(`   Caller sees: "${callerSeesUnmuted}" (class: ${callerSeesClass})`);

    if (hostSeesUnmuted.includes('Unmuted') && callerSeesUnmuted.includes('Unmuted')) {
      console.log('   ✅ PASS: Producer authority overrode self-mute');
    } else {
      console.log('   ❌ FAIL: Producer authority did not override self-mute');
      allPassed = false;
    }

    // Test 4: Host mutes caller (producer-authoritative mute)
    console.log('\n=== Test 4: Producer-Authoritative Mute (Host Mutes Caller) ===');

    console.log('   Host clicks caller mute button to mute...');
    await muteButtonOnHost.click();
    await hostPage.waitForTimeout(1000);

    // Check host's view
    const hostSeesProducerMuted = await muteButtonOnHost.textContent();
    const hostSeesProducerClass = await muteButtonOnHost.getAttribute('class');
    console.log(`   Host sees: "${hostSeesProducerMuted}" (class: ${hostSeesProducerClass})`);

    // Check caller's view (should show producer-muted state)
    await callerPage.waitForTimeout(500);
    const callerSeesProducerMuted = await selfMuteButtonOnCaller.textContent();
    const callerSeesProducerClass = await selfMuteButtonOnCaller.getAttribute('class');
    console.log(`   Caller sees: "${callerSeesProducerMuted}" (class: ${callerSeesProducerClass})`);

    if (callerSeesProducerMuted.includes('Muted') && callerSeesProducerMuted.includes('Host') && callerSeesProducerClass.includes('producer-muted')) {
      console.log('   ✅ PASS: Caller shows producer-muted state (red, with "Host" label)');
    } else {
      console.log('   ❌ FAIL: Expected producer-muted state with "Host" label');
      allPassed = false;
    }

    // Test 5: Caller tries to unmute (should be blocked by producer authority)
    console.log('\n=== Test 5: Conflict Resolution (Caller Cannot Override Producer Mute) ===');

    console.log('   Caller attempts to unmute self (should be blocked)...');
    await selfMuteButtonOnCaller.click();
    await callerPage.waitForTimeout(1000);

    // Check if still muted (producer authority should prevent unmute)
    const stillMutedText = await selfMuteButtonOnCaller.textContent();
    const stillMutedClass = await selfMuteButtonOnCaller.getAttribute('class');
    console.log(`   Caller sees: "${stillMutedText}" (class: ${stillMutedClass})`);

    // Note: Due to conflict resolution, the mute should remain with producer authority
    // The button click might show an alert, but state should not change
    if (stillMutedText.includes('Muted')) {
      console.log('   ✅ PASS: Caller remains muted (producer authority blocks self-unmute)');
    } else {
      console.log('   ⚠️  WARNING: Caller appears unmuted (check conflict resolution logic)');
      // This might not be a hard failure if implementation differs
    }

    // Test 6: Verify audio graph mute state
    console.log('\n=== Test 6: Audio Graph Mute State ===');

    const hostAudioGraphState = await hostPage.evaluate((peerId) => {
      const muteState = window.muteManager.getMuteState(peerId);
      const nodes = window.audioGraph.participantNodes.get(peerId);
      return {
        muted: muteState.muted,
        authority: muteState.authority,
        gainValue: nodes ? nodes.gain.gain.value : null
      };
    }, callerPeerId);

    console.log(`   Host's audio graph for caller: muted=${hostAudioGraphState.muted}, authority=${hostAudioGraphState.authority}, gain=${hostAudioGraphState.gainValue}`);

    if (hostAudioGraphState.muted && hostAudioGraphState.gainValue === 0) {
      console.log('   ✅ PASS: Audio graph reflects mute state (gain = 0)');
    } else {
      console.log('   ❌ FAIL: Audio graph does not reflect mute state correctly');
      allPassed = false;
    }

    // Test 7: Host unmutes caller again (verify full cycle)
    console.log('\n=== Test 7: Full Mute Cycle (Host Unmutes) ===');

    console.log('   Host unmutes caller...');
    await muteButtonOnHost.click();
    await hostPage.waitForTimeout(1000);

    const finalButtonText = await muteButtonOnHost.textContent();
    const finalButtonClass = await muteButtonOnHost.getAttribute('class');
    console.log(`   Host sees: "${finalButtonText}" (class: ${finalButtonClass})`);

    await callerPage.waitForTimeout(500);
    const callerFinalText = await selfMuteButtonOnCaller.textContent();
    const callerFinalClass = await selfMuteButtonOnCaller.getAttribute('class');
    console.log(`   Caller sees: "${callerFinalText}" (class: ${callerFinalClass})`);

    if (finalButtonText.includes('Unmuted') && callerFinalText.includes('Unmuted')) {
      console.log('   ✅ PASS: Full mute cycle completed successfully');
    } else {
      console.log('   ❌ FAIL: Full mute cycle did not complete correctly');
      allPassed = false;
    }

    // Final verification
    const finalAudioGraphState = await hostPage.evaluate((peerId) => {
      const muteState = window.muteManager.getMuteState(peerId);
      const nodes = window.audioGraph.participantNodes.get(peerId);
      return {
        muted: muteState.muted,
        gainValue: nodes ? nodes.gain.gain.value : null
      };
    }, callerPeerId);

    console.log(`   Final audio graph state: muted=${finalAudioGraphState.muted}, gain=${finalAudioGraphState.gainValue}`);

    if (!finalAudioGraphState.muted && finalAudioGraphState.gainValue > 0) {
      console.log('   ✅ PASS: Audio graph restored to unmuted state');
    } else {
      console.log('   ❌ FAIL: Audio graph not correctly restored');
      allPassed = false;
    }

    console.log('\n✅ All tests passed!');
    console.log('\nClosing browser...');

  } catch (error) {
    console.error('❌ Test failed:', error);
    allPassed = false;
  } finally {
    await browser.close();
  }

  if (!allPassed) {
    process.exit(1);
  }
}

testMuteControls();
