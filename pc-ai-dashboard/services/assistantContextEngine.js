export function createSearchAnswer(query, matches) {
  if (!matches.length) {
    return "I could not find a strong memory match yet. Add more memories, places, screenshots, or voice notes and I will connect them for you.";
  }

  const top = matches[0].memory;
  const related = matches.slice(1, 4).map((match) => match.memory.title);
  return [
    `The strongest match is ${top.title}.`,
    top.summary || top.content,
    related.length ? `Related memories: ${related.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function createGeneralAssistantReply({ message, userName, language = null } = {}) {
  const raw = String(message || "").trim();
  const text = raw.toLowerCase();
  const firstName = userName?.split(" ")[0] || "there";
  const hinglish = language?.code === "hi-en";

  if (!raw) return null;

  if (/^(hi|hello|hey|hii|helo|namaste)\b/.test(text)) {
    return hinglish
      ? `Haan ${firstName}, main yahin hoon. Tum mujhse normal chat, ideas, coding, planning, memories, goals, ya decisions ke baare mein pooch sakte ho.`
      : `Hey ${firstName}, I am here. You can chat normally with me about ideas, coding, planning, memories, goals, decisions, or anything you want to think through.`;
  }

  if (/how are you|kaise ho|kaisi ho/.test(text)) {
    return hinglish
      ? "Main achha hoon, ready hoon. Tum batao, aaj kis cheez mein help chahiye?"
      : "I am doing well and ready to help. What do you want to work through today?";
  }

  if (/who are you|what are you|are you like chatgpt/.test(text)) {
    return "I am NeuroNest, your AI memory and conversation assistant. With an OpenAI API key I can answer much more like ChatGPT, while also using your memories, goals, places, and routines as personal context.";
  }

  if (/thank|thanks|shukriya/.test(text)) {
    return hinglish ? "Always. Jab bhi zaroorat ho, main yahin hoon." : "Always. I am here whenever you need me.";
  }

  if (/brainstorm|ideas?|suggest/.test(text)) {
    return [
      "Here are a few strong starting ideas:",
      "1. Define the exact problem in one sentence.",
      "2. List three simple solutions, not perfect ones.",
      "3. Pick the one you can test fastest.",
      "4. Turn it into a 7-day experiment.",
      "5. Save the result in NeuroNest so I can compare patterns later.",
    ].join(" ");
  }

  if (/plan|roadmap|steps|how should i|how do i|learn|build/.test(text)) {
    return [
      "A clean way to approach it:",
      "1. Decide the final outcome.",
      "2. Break it into the smallest useful version.",
      "3. Work in 3 short milestones.",
      "4. Test after each milestone.",
      "5. Keep notes on what worked, what blocked you, and what to improve next.",
    ].join(" ");
  }

  if (/write|draft|caption|email|message|paragraph|essay|rewrite/.test(text)) {
    return [
      "I can help write it. Here is a simple structure:",
      "Opening: say the purpose clearly.",
      "Middle: add the important details in 2-3 lines.",
      "Ending: say the next action or final point.",
      "Send me the exact topic or rough text and I will turn it into a polished version.",
    ].join(" ");
  }

  if (/explain|what is|what are|define|meaning of|how does/.test(text)) {
    return [
      "Here is the simple version:",
      "It means breaking the topic into the main idea, why it matters, and one example.",
      "If you want, ask the same question with the exact topic and I will explain it step by step.",
    ].join(" ");
  }

  if (/code|coding|bug|error|debug|api|server|frontend|backend/.test(text)) {
    return [
      "I can help debug it.",
      "Send me the error message, the file name, and what you expected to happen.",
      "Then I can trace the issue, explain the cause, and suggest the exact fix.",
    ].join(" ");
  }

  if (/pros and cons|should i|decide|decision|worth it/.test(text)) {
    return [
      "Use this decision frame:",
      "Pros: what you gain, what becomes easier, what future option opens.",
      "Cons: time cost, money cost, risk, and what you may need to stop doing.",
      "Best next step: test it small for 7 days before fully committing.",
    ].join(" ");
  }

  if (/summarize|summary/.test(text)) {
    return "Paste the text you want summarized and I will turn it into a short, clear summary with the key points.";
  }

  return null;
}

export function createContextualAssistantReply({ message, userName, semanticMatches = [], relationships = [], insights = [], resurfacing = [] }) {
  const text = String(message || "").trim().toLowerCase();

  if (/^(hi|hello|hey|hii|helo)\b/.test(text)) {
    return `Hello ${userName || "there"}. I am here with your memory context. Ask softly and I will connect the right moments.`;
  }

  if (text.includes("what can you do") || text.includes("who are you") || text.includes("features")) {
    return "I am NeuroNest, your long-term memory assistant. I can search memories semantically, connect places with habits, surface routines, and explain patterns without needing exact keywords.";
  }

  const topMatch = semanticMatches[0];
  const topInsight = insights[0];
  const topRelationship = relationships[0];
  const topResurfacing = resurfacing[0];

  if (topMatch) {
    const memory = topMatch.memory;
    const relationshipLine = topRelationship
      ? `I also see a ${topRelationship.confidence}% relationship between ${topRelationship.sourceTitle} and ${topRelationship.targetTitle}.`
      : "";
    const resurfacingLine = topResurfacing
      ? `I also rediscovered ${topResurfacing.title}: ${topResurfacing.reason}.`
      : "";
    return [
      `${memory.title} feels most relevant.`,
      memory.summary || memory.content,
      relationshipLine,
      resurfacingLine,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (topResurfacing) {
    return `I rediscovered ${topResurfacing.title}. ${topResurfacing.aiExplanation} Suggested next step: ${topResurfacing.suggestedAction}`;
  }

  if (topInsight) return `${topInsight.title}. ${topInsight.body}`;

  return "I saved that conversation as memory context. I can also answer normally, plan with you, explain things, brainstorm ideas, or connect this to your memories when patterns appear.";
}
