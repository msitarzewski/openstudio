/**
 * volume-meter.js
 * Real-time volume meter visualization for OpenStudio
 *
 * Two modes:
 * - 'meter' (default): Segmented LED bar meter with amber/red color ramp
 * - 'waveform': Oscilloscope-style time-domain waveform display
 *
 * Options:
 * - mode: 'meter' | 'waveform'
 * - onSpeaking: callback(isSpeaking) for speaking detection
 */

export class VolumeMeter {
  constructor(canvasElement, analyserNode, options = {}) {
    this.canvas = canvasElement;
    this.analyser = analyserNode;
    this.ctx = null;
    this.animationId = null;
    this.dataArray = null;
    this.bufferLength = 0;
    this.isRunning = false;

    // Mode
    this.mode = options.mode || 'meter';

    // Speaking detection callback
    this.onSpeaking = options.onSpeaking || null;
    this.speakingThreshold = 0.05;

    // Peak hold
    this.peakLevel = 0;
    this.peakHoldTime = 0;
    this.peakHoldDuration = 45; // frames (~1.5s at 30fps effective)

    // Smoothing for meter
    this.smoothedLevel = 0;
    this.smoothingFactor = 0.3;

    // Colors from Signal design system
    this.colors = {
      void:       '#0a0a0f',
      surface:    '#12121a',
      amber:      '#d4a053',
      red:        '#e23636',
      hot:        '#ff4444',
      ghostSeg:   'rgba(255,255,255,0.03)',
      peakWhite:  '#f0e8d8',
      waveAmber:  '#d4a053',
      waveRed:    '#e23636',
      zeroline:   '#3a3630',
    };

    // Broadcasting state (for waveform color)
    this.isBroadcasting = false;

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

    // Set fallback display dimensions from canvas attributes
    // (HiDPI setup deferred to start() when CSS layout is stable)
    this.displayWidth = this.canvas.width;
    this.displayHeight = this.canvas.height;

    // Set up data array for analyser
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    // Time domain data for waveform
    if (this.mode === 'waveform') {
      this.timeDomainData = new Uint8Array(this.bufferLength);
    }

    console.log(`[VolumeMeter] Initialized (${this.mode}) with buffer length:`, this.bufferLength);
  }

  /**
   * Handle high-DPI canvas scaling
   */
  setupHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    // Only scale if we have a valid rect (element is in DOM)
    if (rect.width > 0) {
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(dpr, dpr);
      this.displayWidth = rect.width;
      this.displayHeight = rect.height;
    } else {
      // Fallback to canvas attributes
      this.displayWidth = this.canvas.width;
      this.displayHeight = this.canvas.height;
    }
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

    // Re-setup HiDPI in case canvas was resized
    this.setupHiDPI();

    // Check broadcasting state
    this.isBroadcasting = document.body.classList.contains('broadcasting');

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
    this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

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

    if (this.mode === 'waveform') {
      this.drawWaveform();
    } else {
      this.drawSegmentedMeter();
    }
  }

  /**
   * Calculate RMS (Root Mean Square) level from time domain data
   * @param {Uint8Array} data - Time domain data from analyser
   * @returns {number} RMS value
   */
  calculateRMS(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128.0;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return rms * 128;
  }

  /**
   * Draw segmented LED meter
   */
  drawSegmentedMeter() {
    const width = this.displayWidth;
    const height = this.displayHeight;

    // Get time domain data from analyser
    this.analyser.getByteTimeDomainData(this.dataArray);

    // Calculate RMS level
    const rms = this.calculateRMS(this.dataArray);
    const rawLevel = rms / 128.0;

    // Smooth the level
    this.smoothedLevel += (rawLevel - this.smoothedLevel) * this.smoothingFactor;
    const level = this.smoothedLevel;

    // Speaking detection
    if (this.onSpeaking && level > this.speakingThreshold) {
      this.onSpeaking(true);
    }

    // Update peak hold
    if (level > this.peakLevel) {
      this.peakLevel = level;
      this.peakHoldTime = this.peakHoldDuration;
    } else if (this.peakHoldTime > 0) {
      this.peakHoldTime--;
    } else {
      this.peakLevel = Math.max(0, this.peakLevel - 0.008);
    }

    // Determine segment count based on canvas width
    const isSmall = width < 100;
    const segmentCount = isSmall ? 16 : 32;
    const segmentGap = 2;
    const segmentRadius = 1;
    const segmentWidth = (width - (segmentCount - 1) * segmentGap) / segmentCount;

    // Clear canvas
    this.ctx.fillStyle = this.colors.void;
    this.ctx.fillRect(0, 0, width, height);

    // Draw segments
    const litSegments = Math.floor(level * segmentCount);
    const peakSegment = Math.floor(this.peakLevel * segmentCount);

    for (let i = 0; i < segmentCount; i++) {
      const x = i * (segmentWidth + segmentGap);
      const segmentPosition = i / segmentCount;

      // Determine segment color
      let color;
      if (i < litSegments) {
        if (segmentPosition >= 0.8) {
          color = this.colors.red;
        } else if (segmentPosition >= 0.6) {
          // Transition from amber to red
          const t = (segmentPosition - 0.6) / 0.2;
          color = this.lerpColor(this.colors.amber, this.colors.red, t);
        } else {
          color = this.colors.amber;
        }
      } else if (i === peakSegment && this.peakLevel > 0) {
        color = this.colors.peakWhite;
      } else {
        color = this.colors.ghostSeg;
      }

      this.ctx.fillStyle = color;
      this.roundRect(x, 0, segmentWidth, height, segmentRadius);
    }
  }

  /**
   * Draw waveform oscilloscope
   */
  drawWaveform() {
    const width = this.displayWidth;
    const height = this.displayHeight;

    // Check broadcasting state periodically
    this.isBroadcasting = document.body.classList.contains('broadcasting');

    // Get time domain data
    this.analyser.getByteTimeDomainData(this.dataArray);

    // Clear canvas
    this.ctx.fillStyle = this.colors.void;
    this.ctx.fillRect(0, 0, width, height);

    // Draw center zero-crossing line
    this.ctx.strokeStyle = this.colors.zeroline;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, height / 2);
    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();

    // Draw waveform
    const waveColor = this.isBroadcasting ? this.colors.waveRed : this.colors.waveAmber;

    this.ctx.strokeStyle = waveColor;
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowColor = waveColor;
    this.ctx.shadowBlur = 4;
    this.ctx.beginPath();

    const sliceWidth = width / this.bufferLength;
    let x = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    this.ctx.stroke();

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
  }

  /**
   * Draw a rounded rectangle
   */
  roundRect(x, y, w, h, r) {
    if (r <= 0) {
      this.ctx.fillRect(x, y, w, h);
      return;
    }
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Linear interpolation between two hex colors
   */
  lerpColor(a, b, t) {
    const ah = parseInt(a.replace('#', ''), 16);
    const bh = parseInt(b.replace('#', ''), 16);

    const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;

    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);

    return `rgb(${rr},${rg},${rb})`;
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
    this.onSpeaking = null;
    console.log('[VolumeMeter] Destroyed');
  }
}
