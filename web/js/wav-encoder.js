/**
 * wav-encoder.js
 * Client-side WebM/audio blob to WAV converter
 *
 * Decodes recorded audio blob via AudioContext.decodeAudioData()
 * and writes standard WAV format (44-byte header + PCM samples).
 */

export class WavEncoder {
  /**
   * Convert an audio Blob (WebM/MP4/OGG) to WAV format
   * @param {Blob} audioBlob - Recorded audio blob
   * @param {number} [sampleRate=48000] - Output sample rate
   * @returns {Promise<Blob>} WAV blob
   */
  static async toWav(audioBlob, sampleRate = 48000) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new OfflineAudioContext(1, 1, sampleRate);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const outputRate = audioBuffer.sampleRate;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    WavEncoder.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    WavEncoder.writeString(view, 8, 'WAVE');
    WavEncoder.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, outputRate, true);
    view.setUint32(28, outputRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    WavEncoder.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM samples (interleaved)
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = audioBuffer.getChannelData(ch)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, clamped * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  static writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
