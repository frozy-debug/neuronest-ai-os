import { inferEmotions, summarizeText } from "./unifiedMemoryService.js";
import { generateEmbedding } from "./embeddingService.js";

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function labelsFromText(text) {
  const clean = String(text || "").toLowerCase();
  const labels = [];
  if (/pricing|price|plan|subscription|checkout|cart|order/.test(clean)) labels.push("pricing", "product");
  if (/startup|business|revenue|customer|market|launch/.test(clean)) labels.push("startup", "business");
  if (/ai|model|prompt|chatgpt|openai|agent|automation/.test(clean)) labels.push("AI");
  if (/todo|deadline|meeting|calendar|reminder|task/.test(clean)) labels.push("productivity");
  if (/figma|dashboard|ui|ux|design|screen|app/.test(clean)) labels.push("ui", "design");
  if (/cafe|coffee|workspace|desk|laptop/.test(clean)) labels.push("workspace", "cafe");
  if (/gym|workout|fitness|health/.test(clean)) labels.push("health", "workout");
  if (/travel|trip|hotel|flight|map/.test(clean)) labels.push("travel");
  if (/chat|message|whatsapp|dm|conversation/.test(clean)) labels.push("conversation");
  return unique(labels);
}

function screenshotCaption(text, fileName) {
  const labels = labelsFromText(`${text} ${fileName}`);
  if (labels.includes("pricing")) return "A screenshot about pricing, products, or purchasing decisions.";
  if (labels.includes("AI")) return "A screenshot containing AI, model, prompt, or automation context.";
  if (labels.includes("ui")) return "A UI or app screenshot with design/product inspiration.";
  if (labels.includes("conversation")) return "A conversation screenshot that may contain useful memory context.";
  return "A saved screenshot memory with visual context and extracted text.";
}

export async function analyzeScreenshotMemory({ text = "", fileName = "", mimeType = "", size = 0 }) {
  const labels = labelsFromText(`${text} ${fileName}`);
  const caption = screenshotCaption(text, fileName);
  const topics = unique([...labels, "screenshot"]);
  const summary = summarizeText(text || caption, 300);
  const emotions = inferEmotions(`${caption} ${text} ${topics.join(" ")}`);
  const embeddingInput = [caption, summary, text, fileName, topics.join(" "), emotions.join(" ")].join("\n");
  const embedding = await generateEmbedding(embeddingInput);

  return {
    modality: "screenshot",
    title: fileName ? `Screenshot memory: ${fileName}` : "Screenshot memory",
    caption,
    summary,
    topics,
    emotions,
    tags: unique(["screenshot", ...topics]).slice(0, 10),
    meta: topics[0] || "Screenshot",
    importanceScore: Math.min(96, 58 + topics.length * 6 + (text.length > 120 ? 10 : 0)),
    imageEmbeddingProvider: embedding.provider,
    imageEmbeddingModel: embedding.model,
    visualLabels: labels,
    detectedApps: labels.includes("conversation") ? ["chat"] : labels.includes("ui") ? ["app-ui"] : [],
    media: {
      fileName,
      mimeType,
      size,
      caption,
      visualLabels: labels,
    },
    metadata: {
      ocrText: text,
      fileName,
      mimeType,
      size,
      visualLabels: labels,
      imageCaption: caption,
      topics,
    },
  };
}

export async function analyzeVoiceMemory({ transcript = "", title = "Voice note", duration = "", tags = [] }) {
  const text = `${title} ${transcript} ${tags.join(" ")}`;
  const emotions = inferEmotions(text);
  const lowered = text.toLowerCase();
  const tone = /excited|idea|startup|launch|win|great|love/.test(lowered)
    ? "excited"
    : /stress|tired|blocked|anxious/.test(lowered)
      ? "stressed"
      : /calm|quiet|reflect|journal/.test(lowered)
        ? "calm"
        : "neutral";
  const topics = unique([...labelsFromText(text), "voice", tone]);
  const summary = summarizeText(transcript || title, 260);
  const embedding = await generateEmbedding([title, transcript, summary, tone, topics.join(" "), emotions.join(" ")].join("\n"));

  return {
    modality: "voice",
    title,
    summary,
    tone,
    sentimentScore: tone === "excited" ? 86 : tone === "stressed" ? 42 : tone === "calm" ? 74 : 62,
    topics,
    emotions,
    tags: unique(["voice", ...topics]).slice(0, 10),
    importanceScore: Math.min(96, 56 + topics.length * 5 + (transcript.length > 180 ? 10 : 0)),
    voiceEmbeddingProvider: embedding.provider,
    voiceEmbeddingModel: embedding.model,
    metadata: {
      voiceTranscript: transcript,
      duration,
      tone,
      sentimentScore: tone === "excited" ? 86 : tone === "stressed" ? 42 : tone === "calm" ? 74 : 62,
      topics,
    },
  };
}

export function analyzeVisualMemory(memory) {
  const text = `${memory.title} ${memory.content} ${memory.tags?.join(" ")} ${memory.metadata?.ocrText || ""}`;
  const labels = labelsFromText(text);
  return {
    visualLabels: labels,
    scene: labels.includes("cafe") ? "cafe workspace" : labels.includes("workout") ? "fitness environment" : labels.includes("travel") ? "travel scene" : "memory scene",
    clusterKey: labels[0] || memory.type,
  };
}
