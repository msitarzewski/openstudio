/**
 * volume-meter.js
 * Real-time volume meter visualization for OpenStudio
 *
 * Displays audio levels from an AnalyserNode using canvas-based rendering.
 * Color-coded levels: green (safe), yellow (warning), red (clipping).
 */

export class VolumeMeter {
  constructor(canvasElement, analyserNode) {
    this.canvas = canvasElement;
    this.analyser = analyserNode;
    this.ctx = null;
    this.animationId = null;
    this.dataArray = null;
    this.bufferLength = 0;
    this.isRunning = false;

    // Peak hold
    this.peakLevel = 0;
    this.peakHoldTime = 0;
    this.peakHoldDuration = 30; // frames

    // Level thresholds (0.0 to 1.0)
    this.warningThreshold = 0.7; // Yellow above this
    this.dangerThreshold = 0.9;  // Red above this

    this.initialize();
  }

  /**
   * Initialize canvas and data buffers
   */
  initialize() {
    if (!this.canvas) {
      throw new Error('Canvas element is required');
    }

    if (!this.analyser) {
      throw new Error('AnalyserNode is required');
    }

    // Get 2D context
    this.ctx = this.canvas.getContext('2d');

    // Set up data array for analyser
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    console.log('[VolumeMeter] Initialized with buffer length:', this.bufferLength);
  }

  /**
   * Start the visualization animation loop
   */
  start() {
    if (this.isRunning) {
      console.warn('[VolumeMeter] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[VolumeMeter] Starting animation loop');
    this.draw();
  }

  /**
   * Stop the visualization animation loop
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    console.log('[VolumeMeter] Stopped');
  }

  /**
   * Main drawing loop
   */
  draw() {
    if (!this.isRunning) {
      return;
    }

    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.draw());

    // Get time domain data from analyser
    this.analyser.getByteTimeDomainData(this.dataArray);

    // Calculate RMS level
    const rms = this.calculateRMS(this.dataArray);
    const level = rms / 128.0; // Normalize to 0.0 - 1.0

    // Update peak hold
    if (level > this.peakLevel) {
      this.peakLevel = level;
      this.peakHoldTime = this.peakHoldDuration;
    } else if (this.peakHoldTime > 0) {
      this.peakHoldTime--;
    } else {
      this.peakLevel = Math.max(0, this.peakLevel - 0.01); // Decay
    }

    // Draw the meter
    this.drawMeter(level, this.peakLevel);
  }

  /**
   * Calculate RMS (Root Mean Square) level from time domain data
   * @param {Uint8Array} data - Time domain data from analyser
   * @returns {number} RMS value
   */
  calculateRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128.0; // Convert to -1.0 to 1.0
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return rms * 128; // Scale back to 0-128 range
  }

  /**
   * Draw the volume meter on canvas
   * @param {number} level - Current level (0.0 to 1.0)
   * @param {number} peak - Peak level (0.0 to 1.0)
   */
  drawMeter(level, peak) {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, width, height);

    // Calculate bar width
    const barWidth = width * level;
    const peakX = width * peak;

    // Determine color based on level
    let color;
    if (level >= this.dangerThreshold) {
      color = '#ef4444'; // Red (danger)
    } else if (level >= this.warningThreshold) {
      color = '#f59e0b'; // Yellow (warning)
    } else {
      color = '#10b981'; // Green (safe)
    }

    // Draw main level bar
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, barWidth, height);

    // Draw peak indicator (thin line)
    if (peak > 0) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(peakX - 2, 0, 4, height);
    }

    // Draw threshold markers (subtle lines)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;

    // Warning threshold
    const warningX = width * this.warningThreshold;
    this.ctx.beginPath();
    this.ctx.moveTo(warningX, 0);
    this.ctx.lineTo(warningX, height);
    this.ctx.stroke();

    // Danger threshold
    const dangerX = width * this.dangerThreshold;
    this.ctx.beginPath();
    this.ctx.moveTo(dangerX, 0);
    this.ctx.lineTo(dangerX, height);
    this.ctx.stroke();
  }

  /**
   * Update the analyser node (if it changes)
   * @param {AnalyserNode} analyserNode
   */
  setAnalyser(analyserNode) {
    this.analyser = analyserNode;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    console.log('[VolumeMeter] Analyser updated');
  }

  /**
   * Get current level (for testing/debugging)
   * @returns {number} Current level (0.0 to 1.0)
   */
  getCurrentLevel() {
    if (!this.dataArray) {
      return 0;
    }

    this.analyser.getByteTimeDomainData(this.dataArray);
    const rms = this.calculateRMS(this.dataArray);
    return rms / 128.0;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop();
    this.canvas = null;
    this.analyser = null;
    this.ctx = null;
    this.dataArray = null;
    console.log('[VolumeMeter] Destroyed');
  }
}
