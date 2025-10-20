/**
 * mute-manager.js
 * Manages mute state with producer-authoritative control
 *
 * Authority hierarchy:
 * - producer: Host can mute any participant (absolute, cannot be overridden)
 * - self: Participant can mute themselves (can be overridden by producer)
 *
 * Conflict resolution:
 * - Producer mute beats self-unmute
 * - Self mute can be overridden by producer unmute
 * - Apply mute locally immediately, propagate via signaling
 */

export class MuteManager extends EventTarget {
  constructor(audioGraph) {
    super();
    this.audioGraph = audioGraph;

    // Mute state per participant
    // Map<peerId, {muted: boolean, authority: 'producer'|'self'|null, previousGain: number}>
    this.muteStates = new Map();
  }

  /**
   * Set mute state with conflict resolution
   *
   * @param {string} peerId - Participant to mute/unmute
   * @param {boolean} muted - True to mute, false to unmute
   * @param {'producer'|'self'} authority - Who is making this change
   * @returns {boolean} True if mute was applied, false if blocked by conflict
   */
  setMute(peerId, muted, authority) {
    const currentState = this.muteStates.get(peerId);

    // Conflict resolution: producer authority overrides self
    if (currentState && currentState.muted !== muted) {
      if (!this.canOverride(currentState.authority, authority)) {
        console.log(`[MuteManager] Cannot override ${currentState.authority} mute with ${authority} for ${peerId}`);
        return false;
      }
    }

    // Apply mute to audio graph
    this.applyMute(peerId, muted, authority);

    // Emit event for signaling propagation
    this.dispatchEvent(new CustomEvent('mute-changed', {
      detail: { peerId, muted, authority }
    }));

    return true;
  }

  /**
   * Check if new authority can override existing authority
   *
   * Rules:
   * - Producer can override anything (producer > self)
   * - Self can only override self (or nothing)
   * - No authority can be overridden by anything
   *
   * @param {string|null} existingAuthority - Current mute authority
   * @param {string} newAuthority - New mute authority
   * @returns {boolean} True if override is allowed
   */
  canOverride(existingAuthority, newAuthority) {
    // No existing authority - always allow
    if (!existingAuthority) {
      return true;
    }

    // Producer can override anything
    if (newAuthority === 'producer') {
      return true;
    }

    // Self can only override self (or nothing)
    if (newAuthority === 'self') {
      return existingAuthority === 'self' || !existingAuthority;
    }

    return false;
  }

  /**
   * Apply mute to audio graph with smooth ramping
   *
   * @param {string} peerId - Participant to mute/unmute
   * @param {boolean} muted - True to mute, false to unmute
   * @param {string} authority - Mute authority
   */
  applyMute(peerId, muted, authority) {
    const nodes = this.audioGraph.participantNodes.get(peerId);
    if (!nodes) {
      console.warn(`[MuteManager] No audio nodes for ${peerId}`);
      return;
    }

    const audioContext = this.audioGraph.audioContext;
    const currentGain = nodes.gain.gain.value;

    if (muted) {
      // Store previous gain for restoration
      const previousGain = currentGain > 0 ? currentGain : 1.0;

      // Smooth ramp to 0 (50ms to avoid clicks)
      nodes.gain.gain.setValueAtTime(currentGain, audioContext.currentTime);
      nodes.gain.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + 0.05);

      // Store state
      this.muteStates.set(peerId, { muted: true, authority, previousGain });

      console.log(`[MuteManager] Muted ${peerId} (authority: ${authority}, saved gain: ${previousGain.toFixed(2)})`);
    } else {
      // Restore previous gain
      const state = this.muteStates.get(peerId);
      const previousGain = state?.previousGain || 1.0;

      // Smooth ramp to previous gain (50ms)
      nodes.gain.gain.setValueAtTime(currentGain, audioContext.currentTime);
      nodes.gain.gain.linearRampToValueAtTime(previousGain, audioContext.currentTime + 0.05);

      // Update state
      this.muteStates.set(peerId, { muted: false, authority, previousGain });

      console.log(`[MuteManager] Unmuted ${peerId} (authority: ${authority}, restored gain: ${previousGain.toFixed(2)})`);
    }
  }

  /**
   * Get mute state for participant
   *
   * @param {string} peerId - Participant ID
   * @returns {{muted: boolean, authority: string|null, previousGain: number}}
   */
  getMuteState(peerId) {
    return this.muteStates.get(peerId) || { muted: false, authority: null, previousGain: 1.0 };
  }

  /**
   * Check if participant is muted
   *
   * @param {string} peerId - Participant ID
   * @returns {boolean}
   */
  isMuted(peerId) {
    const state = this.muteStates.get(peerId);
    return state ? state.muted : false;
  }

  /**
   * Get mute authority for participant
   *
   * @param {string} peerId - Participant ID
   * @returns {string|null} 'producer', 'self', or null
   */
  getAuthority(peerId) {
    const state = this.muteStates.get(peerId);
    return state ? state.authority : null;
  }

  /**
   * Remove participant state (cleanup on peer leave)
   *
   * @param {string} peerId - Participant ID
   */
  removeParticipant(peerId) {
    this.muteStates.delete(peerId);
    console.log(`[MuteManager] Removed mute state for ${peerId}`);
  }

  /**
   * Clear all mute states (session cleanup)
   */
  clear() {
    this.muteStates.clear();
    console.log('[MuteManager] Cleared all mute states');
  }

  /**
   * Get debug info for console inspection
   *
   * @returns {object} Debug information
   */
  getDebugInfo() {
    const info = {
      participantCount: this.muteStates.size,
      states: []
    };

    for (const [peerId, state] of this.muteStates) {
      info.states.push({
        peerId: peerId.substring(0, 8) + '...',
        muted: state.muted,
        authority: state.authority,
        previousGain: state.previousGain.toFixed(2)
      });
    }

    return info;
  }
}
