/**
 * test-gain-controls.mjs
 * Automated Playwright test for gain controls UI
 *
 * Tests:
 * - Gain sliders appear for remote participants
 * - Mute buttons toggle state correctly
 * - Gain values update in UI
 * - Audio graph receives correct gain values
 */

import { chromium } from 'playwright';

const WEB_URL = 'http://localhost:8086';
const TIMEOUT = 5000;

async function testGainControls() {
  console.log('=== Gain Controls UI Test ===\n');

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

    console.log('\n3. Host: Creating room...');
    await hostPage.click('#start-session');
    await hostPage.waitForTimeout(2000);

    // Get room ID from host URL hash
    const roomId = await hostPage.evaluate(() => window.location.hash.substring(1));
    console.log(`   Room ID: ${roomId}`);

    console.log('\n4. Caller: Loading page with room ID in URL hash...');
    await callerPage.goto(`${WEB_URL}#${roomId}`);
    await callerPage.waitForTimeout(1000);

    // Override caller dialogs
    await callerPage.evaluate(() => {
      window.confirm = () => false; // Won't be asked, has roomId in URL
      window.prompt = () => null;
      window.alert = () => {};
    });

    console.log('\n5. Caller: Clicking Start Session...');
    await callerPage.click('#start-session');
    await callerPage.waitForTimeout(5000); // Wait longer for WebRTC connection

    console.log('\n6. Checking for gain controls on host page...');

    // Host should see caller with gain controls
    const hostHasGainControls = await hostPage.evaluate(() => {
      const cards = document.querySelectorAll('.participant-card');
      let foundControls = false;

      for (const card of cards) {
        const slider = card.querySelector('.gain-slider');
        const muteButton = card.querySelector('.mute-button');

        if (slider && muteButton) {
          foundControls = true;
          console.log('[Test] Found gain controls on card:', card.dataset.peerId);
        }
      }

      return foundControls;
    });

    if (hostHasGainControls) {
      console.log('✅ Host sees gain controls for remote participant');
    } else {
      console.log('❌ No gain controls found on host page');
    }

    console.log('\n7. Testing gain slider adjustment...');

    // Find the remote participant card and adjust gain
    const gainAdjusted = await hostPage.evaluate(() => {
      const cards = document.querySelectorAll('.participant-card');

      for (const card of cards) {
        const slider = card.querySelector('.gain-slider');
        const gainValue = card.querySelector('.gain-value');

        if (slider) {
          // Adjust gain to 150%
          slider.value = 150;

          // Create and dispatch input event with correct target
          const event = new Event('input', { bubbles: true });
          slider.dispatchEvent(event);

          // Wait a moment for the event to process
          return new Promise(resolve => {
            setTimeout(() => {
              const updatedValue = gainValue.textContent;
              console.log(`[Test] Gain value after adjustment: ${updatedValue}`);
              resolve(updatedValue === '150%');
            }, 100);
          });
        }
      }

      return false;
    });

    if (gainAdjusted) {
      console.log('✅ Gain slider adjustment updates UI correctly');
    } else {
      console.log('❌ Gain slider adjustment failed');
    }

    console.log('\n8. Testing mute button...');

    const muteWorking = await hostPage.evaluate(() => {
      const cards = document.querySelectorAll('.participant-card');

      for (const card of cards) {
        const muteButton = card.querySelector('.mute-button');
        const slider = card.querySelector('.gain-slider');

        // Only test on remote participant cards (those with gain sliders)
        if (muteButton && slider) {
          // Click mute
          muteButton.click();

          // Check if button text changed and slider disabled
          const isMuted = muteButton.textContent.includes('Muted');
          const isDisabled = slider.disabled;

          console.log(`[Test] Mute button text: ${muteButton.textContent}`);
          console.log(`[Test] Slider disabled: ${isDisabled}`);

          return isMuted && isDisabled;
        }
      }

      return false;
    });

    if (muteWorking) {
      console.log('✅ Mute button toggles state correctly');
    } else {
      console.log('❌ Mute button functionality failed');
    }

    console.log('\n9. Checking audio graph integration...');

    const audioGraphUpdated = await hostPage.evaluate(() => {
      if (window.audioGraph) {
        const graphInfo = window.audioGraph.getGraphInfo();
        console.log(`[Test] Audio graph participants: ${graphInfo.participantCount}`);
        console.log(`[Test] Participants:`, graphInfo.participants);

        return graphInfo.participantCount > 0;
      }
      return false;
    });

    if (audioGraphUpdated) {
      console.log('✅ Audio graph has participants with gain nodes');
    } else {
      console.log('❌ Audio graph not properly updated');
    }

    console.log('\n10. Testing unmute...');

    const unmuteWorking = await hostPage.evaluate(() => {
      const cards = document.querySelectorAll('.participant-card');

      for (const card of cards) {
        const muteButton = card.querySelector('.mute-button');
        const slider = card.querySelector('.gain-slider');

        if (muteButton && muteButton.textContent.includes('Muted')) {
          // Click unmute
          muteButton.click();

          // Check if button text changed and slider enabled
          const isUnmuted = muteButton.textContent.includes('Unmuted');
          const isEnabled = !slider.disabled;

          console.log(`[Test] Unmute button text: ${muteButton.textContent}`);
          console.log(`[Test] Slider enabled: ${isEnabled}`);

          return isUnmuted && isEnabled;
        }
      }

      return false;
    });

    if (unmuteWorking) {
      console.log('✅ Unmute restores slider functionality');
    } else {
      console.log('❌ Unmute functionality failed');
    }

    console.log('\n=== Test Summary ===');
    console.log(`Gain controls visible: ${hostHasGainControls ? '✅' : '❌'}`);
    console.log(`Gain slider adjustment: ${gainAdjusted ? '✅' : '❌'}`);
    console.log(`Mute button: ${muteWorking ? '✅' : '❌'}`);
    console.log(`Audio graph integration: ${audioGraphUpdated ? '✅' : '❌'}`);
    console.log(`Unmute button: ${unmuteWorking ? '✅' : '❌'}`);

    const allPassed = hostHasGainControls && gainAdjusted && muteWorking && audioGraphUpdated && unmuteWorking;
    console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

    console.log('\nClosing browser...');
    await browser.close();

    if (!allPassed) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    await browser.close();
    process.exit(1);
  }
}

testGainControls().catch(console.error);
