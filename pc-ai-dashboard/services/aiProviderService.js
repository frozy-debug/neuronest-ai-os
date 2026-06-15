const DEFAULTS = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    chatModel: "openai/gpt-oss-120b",
    textModel: "openai/gpt-oss-120b",
    visionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    transcriptionModel: "whisper-large-v3-turbo",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4.1-mini",
    textModel: "gpt-4.1-mini",
    visionModel: "gpt-4.1-mini",
    transcriptionModel: "gpt-4o-mini-transcribe",
  },
};

function preferredProvider() {
  const configured = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (configured === "groq" || configured === "openai") return configured;
  if (process.env.GROQ_API_KEY) return "groq";
  return "openai";
}

function providerKey(provider) {
  return provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
}

function configuredProvider() {
  const preferred = preferredProvider();
  if (providerKey(preferred)) return preferred;
  const alternate = preferred === "groq" ? "openai" : "groq";
  return providerKey(alternate) ? alternate : preferred;
}

function modelFor(provider, kind) {
  const prefix = provider === "groq" ? "GROQ" : "OPENAI";
  const legacy = kind === "chat" ? process.env[`${prefix}_MODEL`] : "";
  return process.env[`${prefix}_${kind.toUpperCase()}_MODEL`] || legacy || DEFAULTS[provider][`${kind}Model`];
}

export function getGenerativeAiStatus() {
  const provider = configuredProvider();
  const groqReady = Boolean(process.env.GROQ_API_KEY);
  const openaiReady = Boolean(process.env.OPENAI_API_KEY);
  const aiReady = Boolean(providerKey(provider));
  return {
    provider: aiReady ? provider : "unavailable",
    aiReady,
    groqReady,
    openaiReady,
    chatModel: aiReady ? modelFor(provider, "chat") : null,
    textModel: aiReady ? modelFor(provider, "text") : null,
    visionModel: aiReady ? modelFor(provider, "vision") : null,
    transcriptionModel: aiReady ? modelFor(provider, "transcription") : null,
  };
}

export function requireAiProvider(capability, kind = "chat") {
  const provider = configuredProvider();
  const apiKey = String(providerKey(provider) || "").trim();
  if (!apiKey) {
    const error = new Error(`${capability} requires GROQ_API_KEY or OPENAI_API_KEY.`);
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return {
    provider,
    apiKey,
    baseUrl: process.env[`${provider.toUpperCase()}_BASE_URL`] || DEFAULTS[provider].baseUrl,
    model: modelFor(provider, kind),
  };
}

export async function requestChatCompletion({ capability, kind = "chat", body }) {
  const config = requireAiProvider(capability, kind);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model: config.model }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `${config.provider} ${capability} request failed.`);
    error.code = "AI_PROVIDER_ERROR";
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return { data, provider: config.provider, model: data.model || config.model };
}

export async function requestTranscription({ capability, form }) {
  const config = requireAiProvider(capability, "transcription");
  form.set("model", config.model);
  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `${config.provider} ${capability} request failed.`);
    error.code = "AI_PROVIDER_ERROR";
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return { data, provider: config.provider, model: config.model };
}
