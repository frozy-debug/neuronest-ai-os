function count(memories, pattern) {
  return memories.filter((memory) => pattern.test(`${memory.title} ${memory.content} ${memory.tags?.join(" ")} ${memory.emotions?.join(" ")}`)).length;
}

export function buildMemoryDnaProfile(memories, relationships = []) {
  const creative = count(memories, /idea|startup|creative|ai|design|build/i);
  const focus = count(memories, /focus|productive|coding|study|planning/i);
  const exploration = count(memories, /place|travel|trip|cafe|restaurant/i);
  const reflection = count(memories, /journal|note|voice|reflection|recap/i);
  const night = memories.filter((memory) => new Date(memory.createdAt).getHours() >= 20).length;

  let identity = memories.length ? "Deep Focus Builder" : "Not learned";
  if (memories.length && creative >= focus && night >= 2) identity = "Creative Night Thinker";
  else if (exploration > creative) identity = "Explorative Strategist";
  else if (reflection > focus) identity = "Reflective Creator";

  return {
    identity,
    traits: [
      { title: "Focus identity", body: focus ? "You create clarity through planning, deep work, and repeated focus windows." : "Focus identity will sharpen as you save work sessions." },
      { title: "Creative pattern", body: creative ? "Ideas cluster around AI, building, and product-thinking memories." : "Creative clusters need more idea memories." },
      { title: "Exploration profile", body: exploration ? "Places and movement are active anchors in your memory graph." : "Place memories will make your exploration profile smarter." },
      { title: "Reflection style", body: reflection ? "Voice, journal, and note entries are becoming self-reflection signals." : "Add voice or journal entries to reveal reflection style." },
    ],
    metrics: {
      creative,
      focus,
      exploration,
      reflection,
      relationshipDensity: relationships.length,
    },
  };
}
