export const EMBEDDING_DIMENSIONS = 1536;

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

export function localEmbedding(text, dimensions = EMBEDDING_DIMENSIONS) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = tokenize(text);

  tokens.forEach((token) => {
    const hash = hashToken(token);
    const index = hash % dimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.min(token.length, 12) / 12);
  });

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export async function generateEmbedding(memoryText) {
  const input = String(memoryText || "").slice(0, 12_000);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const allowLocalFallback = process.env.ALLOW_LOCAL_AI_FALLBACK === "true";

  if (!apiKey) {
    if (allowLocalFallback) {
      return {
        embedding: localEmbedding(input),
        provider: "local-development-fallback",
        model: "hash-development-fallback",
        dimensions: EMBEDDING_DIMENSIONS,
        warning: "OPENAI_API_KEY is missing. This vector is for explicit local development only.",
      };
    }
    const error = new Error("Semantic embeddings require OPENAI_API_KEY.");
    error.code = "EMBEDDING_PROVIDER_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI embedding request failed.");
    }

    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || !embedding.length) {
      throw new Error("OpenAI returned an empty embedding.");
    }
    return {
      embedding,
      provider: "openai",
      model,
      dimensions: embedding.length,
    };
  } catch (error) {
    if (allowLocalFallback) {
      return {
        embedding: localEmbedding(input),
        provider: "local-development-fallback",
        model: "hash-development-fallback",
        dimensions: EMBEDDING_DIMENSIONS,
        warning: error.message,
      };
    }
    error.code ||= "EMBEDDING_PROVIDER_ERROR";
    error.statusCode ||= 502;
    throw error;
  }
}

export function getEmbeddingStatus() {
  const openaiReady = Boolean(process.env.OPENAI_API_KEY);
  const localAiFallbackAllowed = process.env.ALLOW_LOCAL_AI_FALLBACK === "true";
  return {
    provider: openaiReady ? "openai" : localAiFallbackAllowed ? "local-development-fallback" : "unavailable",
    model: openaiReady
      ? process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
      : localAiFallbackAllowed
        ? "hash-development-fallback"
        : null,
    dimensions: EMBEDDING_DIMENSIONS,
    openaiReady,
    localAiFallbackAllowed,
    productionReady: openaiReady,
  };
}
