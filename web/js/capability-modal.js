/**
 * capability-modal.js
 *
 * Tiny controller for the capability-gating modal (#capability-modal).
 *
 * Used when an AI feature (transcribe, show notes, mp3 export) is unavailable
 * because a host-side tool isn't installed. Renders a per-requirement
 * checklist with copy-pastable install commands.
 *
 * The modal markup lives in web/index.html and uses the native <dialog>
 * element so we get keyboard handling (ESC closes) and ::backdrop styling
 * for free. We add explicit close-button + backdrop-click handlers below.
 */

const MODAL_ID = 'capability-modal';
const TITLE_ID = 'capability-modal-title';
const BODY_ID = 'capability-modal-body';

/**
 * Escape an arbitrary string for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a single requirement row.
 * @param {{ name: string, present: boolean, install?: string }} req
 * @returns {string} HTML
 */
function renderRequirement(req) {
  const icon = req.present ? '✓' : '✗';
  const statusClass = req.present
    ? 'capability-req-status present'
    : 'capability-req-status missing';
  const installBlock = !req.present && req.install
    ? `<pre class="capability-req-install"><code>${escapeHtml(req.install)}</code></pre>`
    : '';

  return `
    <div class="capability-req">
      <div class="capability-req-head">
        <span class="${statusClass}" aria-hidden="true">${icon}</span>
        <span class="capability-req-name">${escapeHtml(req.name)}</span>
        <span class="capability-req-state">${req.present ? 'installed' : 'missing'}</span>
      </div>
      ${installBlock}
    </div>
  `;
}

/**
 * Open the capability modal with a populated body.
 *
 * @param {object} opts
 * @param {string} opts.feature  - identifier (e.g. 'transcribe')
 * @param {string} opts.title    - modal title (e.g. 'Transcription Requires Setup')
 * @param {Array<{ name: string, present: boolean, install?: string }>} opts.requirements
 * @param {string} [opts.intro]  - optional intro paragraph
 */
export function openCapabilityModal({ feature, title, requirements, intro }) {
  const dialog = document.getElementById(MODAL_ID);
  if (!dialog) {
    console.warn('[capability-modal] dialog element missing');
    return;
  }

  const titleEl = document.getElementById(TITLE_ID);
  const bodyEl = document.getElementById(BODY_ID);
  if (titleEl) titleEl.textContent = title || 'Feature Requires Setup';

  const introHtml = intro
    ? `<p class="capability-intro">${escapeHtml(intro)}</p>`
    : `<p class="capability-intro">This feature needs the following on the host running OpenStudio. Install what's missing and reload the page.</p>`;

  const list = Array.isArray(requirements) ? requirements : [];
  const listHtml = list.length
    ? `<div class="capability-req-list">${list.map(renderRequirement).join('')}</div>`
    : '<p class="capability-intro">No requirement detail available.</p>';

  if (bodyEl) {
    bodyEl.innerHTML = introHtml + listHtml;
    bodyEl.dataset.feature = feature || '';
  }

  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    // Fallback for browsers without <dialog> support.
    dialog.setAttribute('open', '');
    dialog.style.display = 'block';
  }
}

/**
 * Close the capability modal.
 */
export function closeCapabilityModal() {
  const dialog = document.getElementById(MODAL_ID);
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
    dialog.style.display = '';
  }
}

/**
 * Bind close handlers (× button, "Got it" button, ESC, backdrop click).
 * Call once during app init.
 */
export function wireCloseHandlers() {
  const dialog = document.getElementById(MODAL_ID);
  if (!dialog) {
    console.warn('[capability-modal] dialog element missing; close handlers not wired');
    return;
  }

  // Explicit [data-close-modal] buttons (× and "Got it").
  dialog.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      closeCapabilityModal();
    });
  });

  // Click on the backdrop (the <dialog> element itself, not its content card)
  // closes the modal — matches expected modal UX.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closeCapabilityModal();
    }
  });

  // <dialog> emits a 'cancel' event when ESC is pressed; default behavior
  // already closes, but we listen so we can normalize behavior if needed.
  dialog.addEventListener('cancel', () => {
    // No-op — let the native close happen.
  });
}
