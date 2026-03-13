/**
 * recording-manager.js
 * Multi-track recording for OpenStudio
 *
 * Records individual participant tracks and the program bus mix.
 * All recording happens client-side using MediaRecorder API.
 */

export class RecordingManager extends EventTarget {
  constructor() {
    super();
    this.recorders = new Map(); // peerId -> { recorder, chunks[], startTime }
    this.programRecorder = null; // { recorder, chunks[], startTime }
    this.isRecording = false;
    this.startTime = null;
    this.timerInterval = null;
  }

  /**
   * Start recording a participant's audio stream
   * @param {string} peerId
   * @param {MediaStream} mediaStream
   */
  startParticipantRecording(peerId, mediaStream) {
    if (this.recorders.has(peerId)) {
      console.warn(`[Recording] Already recording ${peerId}`);
      return;
    }

    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(mediaStream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    const entry = {
      recorder,
      chunks: [],
      startTime: Date.now(),
      peerId
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        entry.chunks.push(e.data);
      }
    };

    recorder.onerror = (e) => {
      console.error(`[Recording] Error recording ${peerId}:`, e.error);
    };

    recorder.start(1000); // 1-second chunks
    this.recorders.set(peerId, entry);
    console.log(`[Recording] Started recording participant: ${peerId}`);
  }

  /**
   * Start recording the program bus (mixed output)
   * @param {MediaStream} programBusStream
   */
  startProgramRecording(programBusStream) {
    if (this.programRecorder) {
      console.warn('[Recording] Already recording program bus');
      return;
    }

    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(programBusStream, {
      mimeType,
      audioBitsPerSecond: 128000
    });

    this.programRecorder = {
      recorder,
      chunks: [],
      startTime: Date.now()
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.programRecorder.chunks.push(e.data);
      }
    };

    recorder.onerror = (e) => {
      console.error('[Recording] Error recording program bus:', e.error);
    };

    recorder.start(1000);
    console.log('[Recording] Started recording program bus');
  }

  /**
   * Start recording all current participants + program bus
   * @param {Map<string, MediaStream>} participantStreams - peerId -> recording stream
   * @param {MediaStream} programBusStream
   */
  startAll(participantStreams, programBusStream) {
    this.isRecording = true;
    this.startTime = Date.now();

    // Start program bus recording
    if (programBusStream) {
      this.startProgramRecording(programBusStream);
    }

    // Start individual participant recordings
    for (const [peerId, stream] of participantStreams) {
      this.startParticipantRecording(peerId, stream);
    }

    // Start timer
    this.timerInterval = setInterval(() => {
      this.dispatchEvent(new CustomEvent('timer-update', {
        detail: { elapsed: Date.now() - this.startTime }
      }));
    }, 1000);

    this.dispatchEvent(new CustomEvent('recording-started', {
      detail: { trackCount: participantStreams.size + (programBusStream ? 1 : 0) }
    }));

    console.log(`[Recording] Started all recordings (${participantStreams.size} participants + program)`);
  }

  /**
   * Stop all recordings and return assembled blobs
   * @returns {{ program: Blob|null, tracks: Map<string, Blob> }}
   */
  stopAll() {
    this.isRecording = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const tracks = new Map();

    // Stop participant recorders
    for (const [peerId, entry] of this.recorders) {
      if (entry.recorder.state !== 'inactive') {
        entry.recorder.stop();
      }
      const blob = new Blob(entry.chunks, { type: entry.recorder.mimeType });
      tracks.set(peerId, blob);
      console.log(`[Recording] Stopped recording ${peerId}: ${(blob.size / 1024).toFixed(1)}KB`);
    }
    this.recorders.clear();

    // Stop program recorder
    let programBlob = null;
    if (this.programRecorder) {
      if (this.programRecorder.recorder.state !== 'inactive') {
        this.programRecorder.recorder.stop();
      }
      programBlob = new Blob(this.programRecorder.chunks, {
        type: this.programRecorder.recorder.mimeType
      });
      console.log(`[Recording] Stopped program recording: ${(programBlob.size / 1024).toFixed(1)}KB`);
      this.programRecorder = null;
    }

    const duration = this.startTime ? Date.now() - this.startTime : 0;
    this.startTime = null;

    this.dispatchEvent(new CustomEvent('recording-stopped', {
      detail: { trackCount: tracks.size, duration }
    }));

    return { program: programBlob, tracks };
  }

  /**
   * Download a single track as a file
   * @param {Blob} blob
   * @param {string} filename
   */
  downloadTrack(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Download all tracks (program + individual)
   * @param {{ program: Blob|null, tracks: Map<string, Blob> }} recordings
   * @param {Map<string, string>} peerNames - peerId -> display name
   */
  downloadAll(recordings, peerNames) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = this.getFileExtension();

    // Download program mix
    if (recordings.program) {
      this.downloadTrack(recordings.program, `openstudio-mix-${timestamp}.${ext}`);
    }

    // Download individual tracks
    for (const [peerId, blob] of recordings.tracks) {
      const name = peerNames?.get(peerId) || peerId.substring(0, 8);
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
      this.downloadTrack(blob, `openstudio-${safeName}-${timestamp}.${ext}`);
    }
  }

  /**
   * Get the best supported MIME type for recording
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return ''; // Let browser choose default
  }

  /**
   * Get file extension based on recording MIME type
   */
  getFileExtension() {
    const mimeType = this.getSupportedMimeType();
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('mp4')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  }

  /**
   * Format elapsed time as HH:MM:SS
   */
  static formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map(v => v.toString().padStart(2, '0'))
      .join(':');
  }

  /**
   * Get estimated recording size in bytes
   */
  getEstimatedSize() {
    let total = 0;
    for (const entry of this.recorders.values()) {
      for (const chunk of entry.chunks) {
        total += chunk.size;
      }
    }
    if (this.programRecorder) {
      for (const chunk of this.programRecorder.chunks) {
        total += chunk.size;
      }
    }
    return total;
  }
}
