/**
 * Show notes generator — creates structured show notes from transcript segments.
 *
 * Generates:
 *   - Episode title (auto-generated via LLM or provided)
 *   - Readable summary paragraph
 *   - Segment markers with timestamps from whisper segments
 */

import { exec as cbExec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(cbExec);

const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.5-35b';

/**
 * Call local LM Studio (Qwen 35B) to generate title + summary from transcript.
 * Returns { title, summary }.
 */
async function llmGenerateTitleAndSummary(fullText) {
  const prompt = `You are a podcast show notes generator. Given the following transcript, produce:

1. A concise, engaging episode title (5-10 words)
2. A 3-4 sentence summary of the key topics discussed

Transcript:
${fullText}

Respond in this exact JSON format with no extra text:
{
  "title": "Episode title here",
  "summary": "Summary paragraph here."
}`;

  try {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`LM Studio responded ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from the response (LLMs sometimes add preamble)
    const jsonMatch = content.match(/\{[\s\S]*"title"[^\}]*\}/);
    if (!jsonMatch) {
      throw new Error(`LLM response didn't contain JSON: ${content.slice(0, 200)}`);
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[ShowNotes] LLM generation failed, using fallback:', err.message);
    // Fallback: generate simple title from first few words of transcript
    const words = fullText.trim().split(/\s+/).slice(0, 8);
    return {
      title: `Episode — ${words.join(' ')}...`,
      summary: fullText.slice(0, 300).trim() + '...',
    };
  }
}

/**
 * Generate structured show notes from whisper transcript segments.
 *
 * @param {Array} segments - Whisper transcript segments [{start, end, text}]
 * @param {Object} options
 * @param {string} [options.episodeTitle] - Override title (if omitted, auto-generated)
 * @param {string} [options.showName] - Show name for header
 * @returns {Promise<{title: string, summary: string, segments: Array}>}
 */
export async function generateShowNotes(segments, options = {}) {
  const { episodeTitle: overrideTitle, showName } = options;

  if (!segments || segments.length === 0) {
    return {
      title: overrideTitle || 'Untitled Episode',
      summary: '',
      segments: [],
    };
  }

  // Build full transcript text for LLM
  const fullText = segments.map(s => s.text).join(' ').trim();

  let title, summary;
  if (overrideTitle) {
    title = overrideTitle;
    // Still generate a summary from the transcript
    try {
      const llmResult = await llmGenerateSummary(fullText);
      summary = llmResult.summary;
    } catch {
      summary = fullText.slice(0, 300).trim() + '...';
    }
  } else {
    const llmResult = await llmGenerateTitleAndSummary(fullText);
    title = llmResult.title;
    summary = llmResult.summary;
  }

  // Build segment markers from whisper segments (only include segments with meaningful text)
  const segmentMarkers = segments
    .filter(s => s.text && s.text.trim().length > 10)
    .map((s, i) => ({
      index: i + 1,
      timestamp: formatTimestamp(s.start),
      seconds: s.start,
      text: s.text.trim(),
    }));

  return { title, summary, segments: segmentMarkers };
}

/**
 * Generate just a summary from transcript text (no title generation).
 */
async function llmGenerateSummary(fullText) {
  const prompt = `Summarize the following podcast transcript in 3-4 sentences, capturing the key topics and discussion points:

${fullText}

Respond with ONLY the summary paragraph, no title or extra text.`;

  try {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) throw new Error(`LM Studio responded ${resp.status}`);
    const data = await resp.json();
    return { summary: data.choices?.[0]?.message?.content?.trim() || '' };
  } catch (err) {
    console.error('[ShowNotes] Summary generation failed:', err.message);
    return { summary: fullText.slice(0, 300).trim() + '...' };
  }
}

/**
 * Format seconds as HH:MM:SS or MM:SS.
 */
function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default { generateShowNotes };
