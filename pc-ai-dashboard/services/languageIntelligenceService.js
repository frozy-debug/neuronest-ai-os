const ROMAN_HINDI_PATTERN = "\\b(kal|aaj|abhi|mera|meri|mere|mujhe|main|maine|tum|tumhara|kya|kyu|kyun|kaise|kaisa|kaisi|kab|kaha|kahaan|gaya|gayi|tha|thi|hai|hain|hu|hoon|karu|karna|chahiye|nahi|nahin|haan|samjha|bata|bta|dekho|wala|wali|acha|accha)\\b";
const ROMAN_HINDI_WORDS = new RegExp(ROMAN_HINDI_PATTERN, "i");
const ROMAN_HINDI_WORDS_GLOBAL = new RegExp(ROMAN_HINDI_PATTERN, "gi");
const ENGLISH_WORK_WORDS = /\b(and|then|worked|work|working|focus|productivity|memory|idea|project|startup|gym|week|routine|coding|build|learn|change|should|what|where|when|how|why|can|could|please)\b/gi;

const LANGUAGE_RULES = [
  { code: "hi", name: "Hindi", script: /[\u0900-\u097F]/, words: ROMAN_HINDI_WORDS },
  { code: "ur", name: "Urdu", script: /[\u0600-\u06FF]/, words: /\b(kya|mera|meri|aaj|kal|kaise|mujhe|nahi|hai)\b/i },
  { code: "pa", name: "Punjabi", script: /[\u0A00-\u0A7F]/, words: /\b(mainu|tusi|ajj|kal|ki|kive)\b/i },
  { code: "bn", name: "Bengali", script: /[\u0980-\u09FF]/ },
  { code: "ta", name: "Tamil", script: /[\u0B80-\u0BFF]/ },
  { code: "te", name: "Telugu", script: /[\u0C00-\u0C7F]/ },
  { code: "mr", name: "Marathi", script: /[\u0900-\u097F]/, words: /\b(majhi|majha|kaay|aaj|kal|mala)\b/i },
  { code: "gu", name: "Gujarati", script: /[\u0A80-\u0AFF]/ },
  { code: "ml", name: "Malayalam", script: /[\u0D00-\u0D7F]/ },
  { code: "ar", name: "Arabic", script: /[\u0600-\u06FF]/ },
  { code: "zh", name: "Chinese", script: /[\u3400-\u9FFF]/ },
  { code: "ja", name: "Japanese", script: /[\u3040-\u30FF]/ },
  { code: "ko", name: "Korean", script: /[\uAC00-\uD7AF]/ },
  { code: "ru", name: "Russian", script: /[\u0400-\u04FF]/ },
  { code: "es", name: "Spanish", words: /\b(como|cómo|semana|estuve|memorias|productividad|ideas|donde|dónde|cuando|cuándo|feliz)\b/i },
  { code: "fr", name: "French", words: /\b(comment|semaine|souvenirs|productivite|productivité|idees|idées|ou|où|quand)\b/i },
  { code: "de", name: "German", words: /\b(wie|woche|erinnerungen|produktivitat|produktivität|ideen|wo|wann)\b/i },
  { code: "pt", name: "Portuguese", words: /\b(como|semana|memorias|memórias|produtividade|ideias|onde|quando)\b/i },
];

const RESPONSE_STYLE = {
  en: "English",
  "hi-en": "natural Hinglish",
  hi: "Hindi",
  ur: "Urdu",
  pa: "Punjabi",
  es: "Spanish",
  fr: "French",
  de: "German",
  ar: "Arabic",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  pt: "Portuguese",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  ml: "Malayalam",
};

function countMatches(text, pattern) {
  const matches = String(text || "").match(pattern);
  return matches ? matches.length : 0;
}

function englishProfile(confidence = 82) {
  return {
    code: "en",
    name: "English",
    confidence,
    mixed: false,
    responseLanguage: "English",
    instruction: "Reply in English. Do not switch to Hinglish unless the current user message mixes Hindi/Hinglish with English.",
  };
}

function languageProfile(code, name, confidence, mixed = false) {
  const responseLanguage = RESPONSE_STYLE[code] || name;
  return {
    code,
    name,
    confidence,
    mixed,
    responseLanguage,
    instruction: code === "hi-en"
      ? "Reply in natural Hinglish because the current user message mixes Hindi/Hinglish with English. Match that blend."
      : `Reply in ${responseLanguage}. Use the current user message language, not the previous conversation language.`,
  };
}

export function detectLanguage(text = "", history = []) {
  const value = String(text || "").trim();
  if (!value) {
    const recentUserMessage = history
      .slice()
      .reverse()
      .find((message) => message.role === "user" && String(message.content || "").trim());
    return recentUserMessage ? detectLanguage(recentUserMessage.content, []) : englishProfile(76);
  }

  const latin = /[a-z]/i.test(value);
  const romanHindiCount = countMatches(value, ROMAN_HINDI_WORDS_GLOBAL);
  const englishWorkCount = countMatches(value, ENGLISH_WORK_WORDS);
  const devanagari = /[\u0900-\u097F]/.test(value);
  const devanagariChars = (value.match(/[\u0900-\u097F]/g) || []).length;
  const latinWords = (value.match(/[a-z]+/gi) || []).length;
  const englishQuestionShape = /\b(what|where|when|how|why|should|can|could|show|find|tell|explain|summarize|summary|productivity|memory|memories|focus|startup|gym|project|week|routine)\b/i.test(value);

  if (devanagari && latin && englishWorkCount > 0 && latinWords >= 2 && devanagariChars < value.length * 0.45) {
    return languageProfile("hi-en", "Hinglish", 94, true);
  }

  if (devanagari) {
    return languageProfile("hi", "Hindi", 94, false);
  }

  if (latin && romanHindiCount >= 2 && englishWorkCount >= 1) {
    return languageProfile("hi-en", "Hinglish", 92, true);
  }

  if (latin && romanHindiCount >= 3 && !englishQuestionShape) {
    return languageProfile("hi-en", "Hinglish", 86, true);
  }

  const scores = new Map();
  LANGUAGE_RULES.forEach((rule) => {
    let score = 0;
    if (rule.script?.test(value)) score += 5;
    if (rule.words?.test(value)) score += 3;
    if (score) scores.set(rule.code, score);
  });

  const best = [...scores.entries()]
    .filter(([code]) => !(code === "hi" && romanHindiCount < 2 && !devanagari))
    .sort((a, b) => b[1] - a[1])[0];

  if (best) {
    const rule = LANGUAGE_RULES.find((item) => item.code === best[0]);
    return languageProfile(rule.code, rule.name, Math.min(98, 62 + best[1] * 9), false);
  }

  return englishProfile(englishQuestionShape ? 88 : 78);
}

function genericLocalizedPrefix(language) {
  const code = language?.code || "en";
  const phrases = {
    en: "I understand.",
    "hi-en": "Haan, samjha.",
    hi: "Samajh gaya.",
    es: "Entiendo.",
    fr: "Je comprends.",
    de: "Verstanden.",
    pt: "Entendi.",
    ar: "أفهم.",
    zh: "我明白了。",
    ja: "わかりました。",
    ko: "이해했어요.",
    ru: "Понимаю.",
    bn: "আমি বুঝেছি।",
    ta: "புரிந்தது.",
    te: "అర్థమైంది.",
    mr: "Samajhle.",
    gu: "Samajh gayu.",
    ml: "Manassilayi.",
    ur: "Samajh gaya.",
    pa: "Samajh gaya.",
  };
  return phrases[code] || phrases.en;
}

export function localizedFallback(message, language = englishProfile(), insight) {
  const summary = insight || "I found memory patterns, routines, and resurfacing signals connected to your question.";
  if (language.code === "en") return `${summary} I am connecting this with your memories, habits, places, emotions, and routines.`;
  if (language.code === "hi-en") return `Haan, samjha. ${summary} Main tumhari memories, habits, places aur focus patterns ko connect karke answer kar raha hoon.`;
  if (language.code === "hi") return `Samajh gaya. ${summary} Main aapki memories, habits, places aur focus patterns ko connect karke jawab de raha hoon.`;
  if (language.code === "es") return `Entiendo. ${summary} Estoy conectando tus recuerdos, habitos y patrones para responderte mejor.`;
  if (language.code === "fr") return `Je comprends. ${summary} Je relie tes souvenirs, habitudes et modeles personnels.`;
  if (language.code === "de") return `Verstanden. ${summary} Ich verbinde deine Erinnerungen, Gewohnheiten und Muster.`;
  if (language.code === "pt") return `Entendi. ${summary} Estou conectando suas memorias, habitos e padroes.`;
  return `${genericLocalizedPrefix(language)} ${summary}`;
}

export function buildLanguageAwareAssistantReply({ language, userName, semanticMatches = [], relationships = [], insights = [], resurfacing = [] }) {
  if (!language || language.code === "en") return null;

  const topMatch = semanticMatches[0]?.memory;
  const topInsight = insights[0];
  const topResurfacing = resurfacing[0];
  const title = topMatch?.title || topResurfacing?.title || topInsight?.title || "your memory pattern";
  const summary = topMatch?.summary || topMatch?.content || topResurfacing?.aiExplanation || topInsight?.body || "I found a useful memory connection.";
  const confidence = topResurfacing?.confidence || semanticMatches[0]?.score || topInsight?.confidence || 76;
  const firstName = userName?.split(" ")[0] || "";
  const relationship = relationships[0]
    ? `${relationships[0].confidence}% relationship: ${relationships[0].sourceTitle} -> ${relationships[0].targetTitle}`
    : "";

  if (language.code === "hi-en") {
    return [
      `Haan ${firstName}, samjha.`,
      `${title} sabse relevant lag raha hai.`,
      summary,
      `${confidence}% confidence hai, tumhari memories aur patterns ke basis par.`,
      relationship ? `Ek connection bhi mila: ${relationship}.` : "",
      topResurfacing?.suggestedAction ? `Next step: ${topResurfacing.suggestedAction}` : "",
    ].filter(Boolean).join(" ");
  }

  if (language.code === "hi") {
    return [
      `Samajh gaya ${firstName}.`,
      `${title} sabse relevant lag raha hai.`,
      summary,
      `${confidence}% confidence hai, aapki memories aur patterns ke basis par.`,
      relationship ? `Ek connection bhi mila: ${relationship}.` : "",
    ].filter(Boolean).join(" ");
  }

  if (language.code === "es") {
    return `Entiendo. ${title} parece lo mas relevante. ${summary} Tengo ${confidence}% de confianza segun tus recuerdos y patrones.`;
  }

  if (language.code === "fr") {
    return `Je comprends. ${title} semble le plus pertinent. ${summary} J'ai ${confidence}% de confiance d'apres tes souvenirs et habitudes.`;
  }

  if (language.code === "de") {
    return `Verstanden. ${title} wirkt am relevantesten. ${summary} Ich habe ${confidence}% Vertrauen basierend auf deinen Erinnerungen und Mustern.`;
  }

  if (language.code === "pt") {
    return `Entendi. ${title} parece o mais relevante. ${summary} Tenho ${confidence}% de confianca com base nas suas memorias e padroes.`;
  }

  return localizedFallback("", language, summary);
}
