function requireOpenAiKey(capability) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    const error = new Error(`${capability} requires OPENAI_API_KEY.`);
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return apiKey;
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("OpenAI returned an empty response.");
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI returned an invalid structured response.");
    return JSON.parse(match[0]);
  }
}

function normalizeStringList(items, limit = 12) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function parseDataUrl(dataUrl, fallbackMimeType = "application/octet-stream") {
  const value = String(dataUrl || "").trim();
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      bytes: Buffer.from(match[2], "base64"),
    };
  }
  return {
    mimeType: fallbackMimeType,
    bytes: Buffer.from(value, "base64"),
  };
}

export function getProductionAiStatus() {
  return {
    openaiReady: Boolean(process.env.OPENAI_API_KEY),
    visionModel: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    localAiFallbackAllowed: process.env.ALLOW_LOCAL_AI_FALLBACK === "true",
  };
}

export async function analyzeScreenshotWithOpenAi({
  imageData,
  ocrText = "",
  fileName = "",
  mimeType = "image/png",
}) {
  const apiKey = requireOpenAiKey("Screenshot AI");
  if (!String(imageData || "").trim()) {
    const error = new Error("Screenshot AI requires imageData.");
    error.code = "IMAGE_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You analyze personal screenshot memories. Return strict JSON with title, description, summary, extractedText, tags, topics, emotions, detectedApps, importanceScore, and scene. Never invent text that is not visible. importanceScore is 0-100.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this screenshot as a searchable personal memory.\nFile: ${fileName || "screenshot"}\nProvided OCR text: ${ocrText || "(none)"}`,
            },
            {
              type: "image_url",
              image_url: {
                url: String(imageData).startsWith("data:")
                  ? imageData
                  : `data:${mimeType || "image/png"};base64,${imageData}`,
              },
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenAI screenshot analysis failed.");
    error.code = "AI_PROVIDER_ERROR";
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  const result = extractJson(data.choices?.[0]?.message?.content);
  return {
    provider: "openai",
    model: data.model || process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
    title: String(result.title || `Screenshot memory: ${fileName || "image"}`).slice(0, 120),
    description: String(result.description || result.summary || "").slice(0, 1200),
    summary: String(result.summary || result.description || "").slice(0, 500),
    extractedText: String(result.extractedText || ocrText || "").slice(0, 12000),
    tags: normalizeStringList(result.tags, 12),
    topics: normalizeStringList(result.topics, 12),
    emotions: normalizeStringList(result.emotions, 8),
    detectedApps: normalizeStringList(result.detectedApps, 8),
    importanceScore: Math.max(0, Math.min(100, Number(result.importanceScore || 50))),
    scene: String(result.scene || "").slice(0, 200),
  };
}

export async function transcribeAudioWithOpenAi({
  audioData,
  fileName = "voice-note.webm",
  mimeType = "audio/webm",
  language = "",
}) {
  const apiKey = requireOpenAiKey("Voice transcription");
  if (!String(audioData || "").trim()) {
    const error = new Error("Voice transcription requires audioData.");
    error.code = "AUDIO_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const parsed = parseDataUrl(audioData, mimeType);
  const form = new FormData();
  form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
  form.append("file", new Blob([parsed.bytes], { type: parsed.mimeType }), fileName || "voice-note.webm");
  if (language) form.append("language", language);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenAI voice transcription failed.");
    error.code = "AI_PROVIDER_ERROR";
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  const transcript = String(data.text || "").trim();
  if (!transcript) throw new Error("OpenAI returned an empty voice transcript.");
  return {
    provider: "openai",
    model: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    transcript,
  };
}

export async function analyzeVoiceTranscriptWithOpenAi({ transcript, title = "Voice note" }) {
  const apiKey = requireOpenAiKey("Voice memory analysis");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Analyze a personal voice-note transcript. Return strict JSON with summary, tone, sentimentScore, topics, emotions, tags, and importanceScore. Do not invent facts. Scores are 0-100.",
        },
        { role: "user", content: `Title: ${title}\nTranscript:\n${String(transcript || "").slice(0, 12000)}` },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenAI voice analysis failed.");
    error.code = "AI_PROVIDER_ERROR";
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  const result = extractJson(data.choices?.[0]?.message?.content);
  return {
    provider: "openai",
    model: data.model || process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
    title: String(title || "Voice note").slice(0, 120),
    summary: String(result.summary || transcript || "").slice(0, 500),
    tone: String(result.tone || "neutral").slice(0, 80),
    sentimentScore: Math.max(0, Math.min(100, Number(result.sentimentScore || 50))),
    topics: normalizeStringList(result.topics, 12),
    emotions: normalizeStringList(result.emotions, 8),
    tags: normalizeStringList(["voice", ...(Array.isArray(result.tags) ? result.tags : []), ...(Array.isArray(result.topics) ? result.topics : [])], 12),
    importanceScore: Math.max(0, Math.min(100, Number(result.importanceScore || 50))),
    metadata: {
      voiceTranscript: String(transcript || "").slice(0, 12000),
      tone: String(result.tone || "neutral").slice(0, 80),
      sentimentScore: Math.max(0, Math.min(100, Number(result.sentimentScore || 50))),
      topics: normalizeStringList(result.topics, 12),
      aiProvider: "openai",
      aiModel: data.model || process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
    },
  };
}
