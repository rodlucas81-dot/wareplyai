// /api/diagnose — accent diagnostic pipeline
// 1. Accepts a multipart upload: { audio: Blob, passage: string, user_l1?: string, mode?: string }
// 2. Transcribes audio via OpenAI Whisper (with word timestamps)
// 3. Sends the (expected, actual, timings, duration) to Claude for a structured analysis
// 4. Returns combined JSON for the frontend to render
//
// Requires Netlify env vars:
//   OPENAI_API_KEY       — for Whisper transcription
//   ANTHROPIC_API_KEY    — for Claude analysis

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405);
  }

  const openaiKey = Netlify.env.get("OPENAI_API_KEY");
  const anthropicKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!openaiKey) return json({ error: { message: "Server missing OPENAI_API_KEY env var" } }, 500);
  if (!anthropicKey) return json({ error: { message: "Server missing ANTHROPIC_API_KEY env var" } }, 500);

  // Parse multipart upload
  let formData;
  try {
    formData = await req.formData();
  } catch (e) {
    return json({ error: { message: "Expected multipart/form-data: " + e.message } }, 400);
  }

  const audio = formData.get("audio");
  const passage = (formData.get("passage") || "").toString();
  const userL1 = (formData.get("user_l1") || "Brazilian Portuguese").toString();
  const mode = (formData.get("mode") || "read").toString();

  if (!audio || typeof audio === "string") {
    return json({ error: { message: "Missing 'audio' file in form data" } }, 400);
  }

  // ─── Step 1: Whisper transcription ───────────────────────────────
  const whisperForm = new FormData();
  whisperForm.append("file", audio, "audio.webm");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("response_format", "verbose_json");
  whisperForm.append("language", "en");
  whisperForm.append("timestamp_granularities[]", "word");

  let whisper;
  try {
    const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm
    });
    if (!wRes.ok) {
      const errText = await wRes.text();
      return json({ error: { message: "Whisper API failed", detail: errText, status: wRes.status } }, 502);
    }
    whisper = await wRes.json();
  } catch (e) {
    return json({ error: { message: "Whisper request error: " + e.message } }, 502);
  }

  const transcript = whisper.text || "";
  const words = whisper.words || [];
  const duration = whisper.duration || 0;
  const wpm = duration > 0 ? Math.round((words.length / duration) * 60) : 0;

  // ─── Step 2: Claude analysis ─────────────────────────────────────
  const prompt = buildAnalysisPrompt({ passage, transcript, words, duration, wpm, mode, userL1 });

  let analysisText = "";
  try {
    const cRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2400,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!cRes.ok) {
      const errText = await cRes.text();
      return json({ error: { message: "Claude API failed", detail: errText, status: cRes.status }, transcript, words, duration, wpm }, 502);
    }
    const cJson = await cRes.json();
    analysisText = cJson?.content?.[0]?.text || "";
  } catch (e) {
    return json({ error: { message: "Claude request error: " + e.message }, transcript, words, duration, wpm }, 502);
  }

  // Extract JSON from Claude's response (be tolerant of code fences)
  let analysis = null;
  const cleaned = analysisText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { analysis = JSON.parse(m[0]); } catch {}
    }
  }
  if (!analysis) {
    analysis = { error: "Could not parse JSON from analysis", raw: analysisText };
  }

  return json({
    transcript,
    words,
    duration,
    wpm,
    analysis
  }, 200);
};

function buildAnalysisPrompt({ passage, transcript, words, duration, wpm, mode, userL1 }) {
  const timingSample = (words || [])
    .slice(0, 100)
    .map(w => `${w.word.trim()}@${w.start.toFixed(2)}-${w.end.toFixed(2)}`)
    .join(" ");

  return `You are a professional accent reduction coach analyzing a recording from an advanced ${userL1} speaker of English (decades in the US, fluent, persistent accent). They've asked for a deep, personalized diagnosis — not generic beginner advice.

EXPECTED TEXT (what they were asked to read):
"""
${passage}
"""

WHAT WHISPER TRANSCRIBED (their actual production):
"""
${transcript}
"""

AUDIO DURATION: ${duration.toFixed(1)}s
WORDS PER MINUTE: ${wpm} (natural English is 150-180 wpm)

WORD-LEVEL TIMINGS (word@start-end seconds):
${timingSample}

YOUR ANALYSIS JOB:
Compare expected vs. transcribed. Mismatches signal where Whisper couldn't reliably parse their production (= likely accent issue). Use word timings to detect prosody issues: unnaturally even spacing = syllable-timed (Portuguese-like), big variation between content and function words = English-like stress-timing.

For a fluent ${userL1} speaker, the highest-impact issues are usually (in order of importance for sounding natural):
1. PROSODY — stress-timing, sentence stress, intonation contour, linking, reductions
2. VOWEL DRIFT — schwa reduction missing, /æ/ not open enough, /ɪ/ vs /iː/, /ʊ/ vs /uː/
3. PERSISTENT PHONEMES — voiced/voiceless TH, dark L, American R, final consonants
4. WORD-LEVEL STRESS — long Latinate words (opportunity, appreciate)

Don't list generic ${userL1}-English issues that didn't actually appear in this recording. Cite their actual words.

RETURN ONLY a JSON object — no markdown fences, no preamble, no commentary. Exact schema:

{
  "summary": "1-2 sentences in Brazilian Portuguese capturing their overall accent profile (e.g., 'Fluência alta; sotaque carregado por ritmo syllable-timed e vogal /æ/ pouco aberta.')",
  "wpm_assessment": "1-line PT-BR assessment of pace and what it means",
  "top_issues": [
    {
      "category": "prosody" | "vowel" | "phoneme" | "stress" | "linking",
      "title": "Short PT-BR title (max 60 chars)",
      "evidence": "PT-BR explanation citing specific words from their actual recording. Wrap their words in [brackets].",
      "example_words": ["word1", "word2"],
      "fix_pt": "Concrete PT-BR coaching — what specifically to do differently. Be tactical.",
      "drill_pt": "A 1-sentence drill they can practice — e.g. a minimal-pair exercise or a stress pattern to repeat",
      "priority": "high" | "medium" | "low"
    }
  ],
  "strengths": ["2-3 specific things they're doing well, in PT-BR, citing evidence"],
  "next_session_focus": "1 sentence PT-BR identifying the single most important thing to work on before next session"
}

Aim for 3-5 top_issues, ordered by priority (high first). Be evidence-based. If the recording is clearly good in some area, say so in strengths — don't manufacture issues.`;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

export const config = { path: "/api/diagnose" };
