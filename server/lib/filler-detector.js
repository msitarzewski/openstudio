/**
 * Filler word detector — scans transcript text and returns intervals to remove.
 *
 * Matches whole-word filler tokens using word-boundary-aware regex.
 * Handles both lowercase input and mixed-case transcript text.
 */

// Common filler words / phrases (English)
const FILLERS = [
  'uh', 'um', 'ah', 'erm', 'err',
  'like', 'you know', 'actually',
  'basically', 'literally', 'obviously',
  'right', 'okay', 'ok', 'alright',
  'so', 'well', 'now',
  'sort of', 'kind of', 'i mean',
  'what is it', 'here\'s the thing',
  'let me see', 'let me think',
];

// Build a single regex: (word_boundary)(filler)(word_boundary)
const escaped = FILLERS.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const pattern = new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');

/**
 * Detect filler word intervals in a transcript.
 *
 * @param {Array<{start: number, end: number, text: string}>} transcript
 *   Whisper.cpp-style transcript with start/end in seconds and text.
 * @param {object} [opts]
 * @param {number} [opts.padding=0.3]  Seconds of padding around each match
 * @returns {Array<{start: number, end: number}>}  Sorted, deduplicated intervals
 */
export function detectFillers(transcript, opts = {}) {
  const { padding = 0.3 } = opts;
  const intervals = [];

  for (const seg of transcript) {
    if (!seg.text) continue;
    const lower = seg.text.toLowerCase();
    let m;
    while ((m = pattern.exec(lower)) !== null) {
      const matchLen = m[0].length;
      const textLen = seg.text.length;
      const matchStart = seg.start + (m.index / textLen) * (seg.end - seg.start);
      const matchEnd = seg.start + ((m.index + matchLen) / textLen) * (seg.end - seg.start);
      intervals.push({
        start: Math.max(0, matchStart - padding),
        end: matchEnd + padding,
      });
    }
  }

  return sortAndMerge(intervals);
}

/**
 * Sort intervals by start time, merge overlapping ones.
 */
function sortAndMerge(intervals) {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i].start <= last.end) {
      last.end = Math.max(last.end, intervals[i].end);
    } else {
      merged.push(intervals[i]);
    }
  }
  return merged;
}

export default { detectFillers };
