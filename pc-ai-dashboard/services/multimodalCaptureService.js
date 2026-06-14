import { analyzeScreenshotMemory, analyzeVoiceMemory, analyzeVisualMemory } from "./multimodalMemoryService.js";
import { summarizeText } from "./unifiedMemoryService.js";

export async function enrichScreenshotCapture(event, baseAnalysis) {
  const screenshot = await analyzeScreenshotMemory({
    text: event.text || event.ocrText || "",
    fileName: event.fileName || event.title || "autonomous-screenshot",
    mimeType: event.mimeType || "",
    size: Number(event.size || 0),
  });

  return {
    ...baseAnalysis,
    type: "screenshot",
    title: screenshot.title || baseAnalysis.title,
    summary: screenshot.summary || baseAnalysis.summary,
    tags: [...new Set([...baseAnalysis.tags, ...screenshot.tags, "visual-memory"])].slice(0, 12),
    emotions: screenshot.emotions || baseAnalysis.emotions,
    importanceScore: Math.max(baseAnalysis.importanceScore, screenshot.importanceScore || 0),
    media: screenshot.media,
    metadata: {
      ...baseAnalysis.metadata,
      ...screenshot.metadata,
      visualAnalysis: analyzeVisualMemory({ title: screenshot.title, content: screenshot.summary, tags: screenshot.tags, type: "screenshot" }),
    },
  };
}

export async function enrichVoiceCapture(event, baseAnalysis) {
  const voice = await analyzeVoiceMemory({
    transcript: event.text || event.transcript || "",
    title: event.title || "Autonomous voice memory",
    duration: event.duration || event.context || "",
    tags: baseAnalysis.tags,
  });

  return {
    ...baseAnalysis,
    type: "voice",
    title: voice.title || baseAnalysis.title,
    summary: voice.summary || baseAnalysis.summary,
    tags: [...new Set([...baseAnalysis.tags, ...voice.tags])].slice(0, 12),
    emotions: voice.emotions || baseAnalysis.emotions,
    importanceScore: Math.max(baseAnalysis.importanceScore, voice.importanceScore || 0),
    metadata: { ...baseAnalysis.metadata, ...voice.metadata },
  };
}

export function enrichCopiedTextCapture(event, baseAnalysis) {
  const text = String(event.text || "");
  return {
    ...baseAnalysis,
    type: /code|function|const|class|import|api|server/i.test(text) ? "idea" : "memory",
    title: baseAnalysis.intent === "idea-burst" ? "Copied idea captured" : "Copied text memory",
    summary: summarizeText(text, 420),
    tags: [...new Set([...baseAnalysis.tags, "clipboard", "copied-text"])].slice(0, 12),
    metadata: {
      ...baseAnalysis.metadata,
      copiedTextPreview: summarizeText(text, 180),
      capturePermission: "user-copy-event-or-manual-read",
    },
  };
}

export function enrichBrowserContextCapture(event, baseAnalysis) {
  return {
    ...baseAnalysis,
    type: baseAnalysis.intent === "research" ? "insight" : "timeline",
    title: baseAnalysis.intent === "research" ? "Research activity captured" : "Browser activity memory",
    summary: summarizeText(baseAnalysis.summary || event.context || event.url || "Browser context captured.", 360),
    tags: [...new Set([...baseAnalysis.tags, "browser-context"])].slice(0, 12),
    metadata: {
      ...baseAnalysis.metadata,
      url: event.url || "",
      pageTitle: event.pageTitle || "",
    },
  };
}

export async function enrichMultimodalCapture(event, baseAnalysis) {
  if (event.type === "screenshot") return enrichScreenshotCapture(event, baseAnalysis);
  if (event.type === "voice-snippet") return enrichVoiceCapture(event, baseAnalysis);
  if (event.source === "clipboard" || event.type === "copy-text") return enrichCopiedTextCapture(event, baseAnalysis);
  if (event.source === "browser" || event.url) return enrichBrowserContextCapture(event, baseAnalysis);
  return baseAnalysis;
}
