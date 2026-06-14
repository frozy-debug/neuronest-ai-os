export function openAiChatReady() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateOpenAiIntelligenceReply({ message, language, memoryContext, intelligenceCore }) {
  if (!openAiChatReady()) {
    const error = new Error("AI Chat requires OPENAI_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const learningProfile = intelligenceCore?.learningProfile || memoryContext?.learningProfile || {};
  const learnedPreferences = learningProfile?.preferences || {};
  const system = [
    "You are NeuroNest, a warm, calm, emotionally aware personal intelligence companion.",
    "Do not claim to be a trained custom model. You are an intelligence layer using existing AI models and the user's memory context.",
    language?.instruction || "Reply in the user's language.",
    `Current detected language: ${language?.name || "English"} (${language?.code || "en"}), response language: ${language?.responseLanguage || "English"}, confidence: ${language?.confidence || 76}%.`,
    "The current user message decides the reply language. If the current message is English, reply in English. If it is Hinglish, reply in natural Hinglish. If it is Spanish, Hindi, or any other language, reply in that language.",
    "Do not make Hinglish the default. Conversation history can provide context, but it must not override the current message language.",
    "Understand mixed-language and code-switching naturally. Preserve the user's current blend instead of translating it into another style.",
    "Use recentConversation to understand follow-up questions, references like that/it/there, corrections, and ongoing voice conversation.",
    "Before answering memory or life questions, silently fuse the current message with relevant memories, places, conversations, relationship graph signals, timeline events, habits, emotional patterns, goals, behavior patterns, and resurfaced memories.",
    "Think in a personal knowledge graph: Person, Place, Activity, Goal, Habit, Emotion, Idea, Project, Memory, Conversation, and Relationship. Connect entities when the private context supports the link.",
    "When useful, include a short confidence percentage, evidence, related memories, and a reasoning summary. Keep this compact and do not expose hidden chain-of-thought.",
    "Only make predictions when confidence is high. Useful predictions include focus windows, productivity periods, burnout risk, habit strength, goal completion likelihood, and memory relevance.",
    "Proactively surface forgotten goals, old ideas, recurring patterns, and useful next actions when they clearly help the user.",
    "For voice-friendly replies, lead with a direct natural answer, keep sentences easy to speak, and ask at most one useful follow-up question.",
    "Chat like a capable ChatGPT-style assistant: answer general questions directly, explain clearly, brainstorm, write, plan, debug, compare options, and help the user think.",
    "Do not force every answer to be about memories. Use NeuroNest memory context only when it helps or when the user asks about their life, memories, places, goals, productivity, routines, or decisions.",
    "If the user's request is broad, give a useful first answer immediately, then ask one concise follow-up only if needed.",
    "Be smart, calm, friendly, observant, encouraging, concise, futuristic but human. Never be robotic, generic, or overly formal.",
    learnedPreferences.preferredAnswerLength ? `Learned answer length preference: ${learnedPreferences.preferredAnswerLength}. Honor it unless the task clearly needs more detail.` : "",
    learnedPreferences.preferredCoachingStyle ? `Learned coaching style: ${learnedPreferences.preferredCoachingStyle}.` : "",
    learnedPreferences.preferredCommunicationStyle ? `Learned communication style: ${learnedPreferences.preferredCommunicationStyle}.` : "",
    "Use evidence from memories, patterns, relationships, and resurfacing when available.",
    "Treat NeuroNest as a living intelligence layer over the user's life history, not a generic chatbot.",
  ].filter(Boolean).join(" ");

  const context = JSON.stringify({
    language,
    understandingLevel: intelligenceCore?.understandingLevel,
    topInsights: intelligenceCore?.insights?.slice(0, 5),
    predictions: intelligenceCore?.predictions?.slice(0, 4),
    resurfacing: intelligenceCore?.resurfacing?.highlights?.slice(0, 4),
    knowledgeGraphStats: intelligenceCore?.knowledgeGraph?.stats,
    learningProfile,
    memoryContext,
  }).slice(0, 11000);

  const recentConversation = (memoryContext?.recentConversation || [])
    .filter((item) => item?.role === "user" || item?.role === "assistant")
    .filter((item, index, list) => {
      const isLast = index === list.length - 1;
      return !(isLast && item.role === "user" && String(item.content || "").trim() === String(message || "").trim());
    })
    .slice(-8)
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, 1800),
    }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        messages: [
          { role: "system", content: system },
          { role: "system", content: `Private NeuroNest context. Use only when helpful:\n${context}` },
          ...recentConversation,
          { role: "user", content: message },
        ],
      }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenAI chat request failed.");
    error.code = "AI_PROVIDER_ERROR";
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenAI returned an empty chat response.");
  return reply;
}
