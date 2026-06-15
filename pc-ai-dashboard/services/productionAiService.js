import { getGenerativeAiStatus, requestChatCompletion, requestTranscription } from "./aiProviderService.js";

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("AI provider returned an empty response.");
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI provider returned an invalid structured response.");
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
    ...getGenerativeAiStatus(),
    localAiFallbackAllowed: process.env.ALLOW_LOCAL_AI_FALLBACK === "true",
  };
}

export async function analyzeScreenshotWithOpenAi({
  imageData,
  ocrText = "",
  fileName = "",
  mimeType = "image/png",
}) {
  if (!String(imageData || "").trim()) {
    const error = new Error("Screenshot AI requires imageData.");
    error.code = "IMAGE_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const { data, provider, model } = await requestChatCompletion({
    capability: "Screenshot AI",
    kind: "vision",
    body: {
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
    },
  });

  const result = extractJson(data.choices?.[0]?.message?.content);
  return {
    provider,
    model,
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
  if (!String(audioData || "").trim()) {
    const error = new Error("Voice transcription requires audioData.");
    error.code = "AUDIO_REQUIRED";
    error.statusCode = 400;
    throw error;
  }

  const parsed = parseDataUrl(audioData, mimeType);
  const form = new FormData();
  form.append("file", new Blob([parsed.bytes], { type: parsed.mimeType }), fileName || "voice-note.webm");
  if (language) form.append("language", language);

  const { data, provider, model } = await requestTranscription({ capability: "Voice transcription", form });

  const transcript = String(data.text || "").trim();
  if (!transcript) throw new Error(`${provider} returned an empty voice transcript.`);
  return {
    provider,
    model,
    transcript,
  };
}

export async function analyzeVoiceTranscriptWithOpenAi({ transcript, title = "Voice note" }) {
  const { data, provider, model } = await requestChatCompletion({
    capability: "Voice memory analysis",
    kind: "text",
    body: {
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
    },
  });
  const result = extractJson(data.choices?.[0]?.message?.content);
  return {
    provider,
    model,
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
      aiProvider: provider,
      aiModel: model,
    },
  };
}
