const MONTHS = new Map([
  ["january", 0],
  ["february", 1],
  ["march", 2],
  ["april", 3],
  ["may", 4],
  ["june", 5],
  ["july", 6],
  ["august", 7],
  ["september", 8],
  ["october", 9],
  ["november", 10],
  ["december", 11],
]);

const CATEGORY_PATTERNS = [
  ["Restaurant", /\b(restaurant|dinner|lunch|food|meal|kfc|pizza|burger|dhaba)\b/i],
  ["Cafe", /\b(cafe|coffee|starbucks|blue tokai|barista|chai|tea)\b/i],
  ["Gym", /\b(gym|fitness|workout|training|sports complex|turf)\b/i],
  ["Hotel", /\b(hotel|motel|inn|resort|stay)\b/i],
  ["Airport", /\b(airport|terminal|flight)\b/i],
  ["Park", /\b(park|garden|trail)\b/i],
  ["Office", /\b(office|coworking|workspace|company|workplace)\b/i],
  ["School", /\b(school|college|university|campus)\b/i],
  ["Store", /\b(store|shop|mall|market|shopping)\b/i],
];

const TOPIC_PATTERNS = [
  ["Startup", /\b(startup|saas|founder|business|launch|mvp|pricing|customer|neuronest)\b/i],
  ["Coding", /\b(code|coding|github|render|api|backend|frontend|database|bug|deploy)\b/i],
  ["Fitness", /\b(gym|workout|fitness|training|health|run|diet)\b/i],
  ["Travel", /\b(travel|trip|journey|airport|hotel|city|visited)\b/i],
  ["Study", /\b(study|learn|course|book|exam|notes)\b/i],
  ["Design", /\b(design|ui|ux|logo|figma|animation|dashboard)\b/i],
  ["Productivity", /\b(productive|focus|deep work|routine|habit|task|goal)\b/i],
];

const POSITIVE_WORDS = /\b(happy|happiest|calm|excited|motivated|great|good|amazing|proud|love|loved|inspired|clear|best|win|peaceful|beautiful|fun)\b/i;
const STRESS_WORDS = /\b(stress|stressed|anxious|burnout|tired|drained|pressure|overwhelmed|argument|sad|angry|problem|blocked|bad|hurt)\b/i;
const PRODUCTIVE_WORDS = /\b(productive|focus|focused|deep work|built|build|fixed|ship|shipped|launch|launched|coding|study|learn|project|startup|deploy|tested|workout)\b/i;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function nowIso() {
  return new Date().toISOString();
}

function stableId(...parts) {
  return parts
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 150);
}

function asDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function monthRange(year, monthIndex) {
  return {
    from: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)),
  };
}

function timestampOf(item = {}) {
  return item.departureTime || item.arrivalTime || item.timestamp || item.createdAt || item.createdDate || item.updatedAt || nowIso();
}

function textOf(item = {}) {
  const metadata = item.metadata || {};
  return [
    item.title,
    item.content,
    item.body,
    item.summary,
    item.description,
    item.meta,
    item.type,
    item.kind,
    item.category,
    item.placeName,
    item.address,
    item.city,
    item.state,
    item.country,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    Array.isArray(item.emotions) ? item.emotions.join(" ") : item.emotions,
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
    metadata.imageCaption,
    metadata.placeName,
    metadata.address,
    metadata.category,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(value, max = 190) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function coordinatesOf(item = {}) {
  const location = item.location || item.metadata?.location || item.coordinates || {};
  const latitude = numberOrNull(item.latitude ?? item.lat ?? location.latitude ?? location.lat);
  const longitude = numberOrNull(item.longitude ?? item.lng ?? location.longitude ?? location.lng);
  if (!validCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}

function cleanAddressPart(value) {
  return String(value || "")
    .replace(/\b\d{5,6}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addressParts(item = {}) {
  const rawAddress = item.address || item.formattedAddress || item.location?.label || item.metadata?.address || "";
  const parts = String(rawAddress)
    .split(",")
    .map((part) => cleanAddressPart(part))
    .filter(Boolean);
  const country = item.country || item.metadata?.country || parts.at(-1) || "Unknown country";
  const state = item.state || item.metadata?.state || parts.at(-2) || "Unknown state";
  const city = item.city || item.metadata?.city || parts.at(-3) || parts.at(-2) || "Unknown city";
  const area = item.area || item.metadata?.area || parts.at(0) || city;
  return {
    country: snippet(country, 90),
    state: snippet(state, 90),
    city: snippet(city, 90),
    area: snippet(area, 90),
  };
}

function categoryOf(item = {}) {
  const text = textOf(item);
  const raw = item.category || item.primaryTypeDisplayName || item.primaryType || item.metadata?.category || "";
  const rawClean = String(raw || "").replace(/_/g, " ").trim();
  if (rawClean) {
    const title = rawClean
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
    const matched = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(`${title} ${text}`));
    return matched?.[0] || title;
  }
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || "Location";
}

function placeNameOf(item = {}) {
  return snippet(
    item.placeName ||
      item.name ||
      item.title ||
      item.metadata?.placeName ||
      item.location?.label ||
      item.address ||
      "Visited location",
    120,
  );
}

function evidenceItem(item = {}, reason = "location evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || item.sourceId || stableId(item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || item.sourceBucket || "memory"),
    title: snippet(item.title || item.sourceTitle || item.placeName || item.name || item.content || item.body || "Evidence", 130),
    timestamp: timestampOf(item),
    reason,
  };
}

function uniqueBy(items = [], keyFn, limit = 5000) {
  const seen = new Set();
  const result = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const key = keyFn(item, index);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function parsePeriod({ query = "", from = "", to = "", now = new Date() } = {}) {
  const clean = String(query || "").toLowerCase();
  const explicitFrom = asDate(from);
  const explicitTo = asDate(to);
  if (explicitFrom || explicitTo) {
    const start = explicitFrom ? startOfDay(explicitFrom) : new Date(0);
    const end = explicitTo ? endOfDay(explicitTo) : now;
    return { label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`, from: start, to: end, mode: "custom" };
  }

  if (/\blast year\b/.test(clean)) {
    const year = now.getUTCFullYear() - 1;
    return { label: String(year), from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)), mode: "last-year" };
  }

  const agoMatch = clean.match(/\b(\d+)\s+(day|week|month|year)s?\s+ago\b/);
  if (agoMatch) {
    const amount = Number(agoMatch[1]);
    const unit = agoMatch[2];
    const target = new Date(now);
    if (unit === "day") target.setUTCDate(target.getUTCDate() - amount);
    if (unit === "week") target.setUTCDate(target.getUTCDate() - amount * 7);
    if (unit === "month") target.setUTCMonth(target.getUTCMonth() - amount);
    if (unit === "year") target.setUTCFullYear(target.getUTCFullYear() - amount);
    if (unit === "day") return { label: target.toISOString().slice(0, 10), from: startOfDay(target), to: endOfDay(target), mode: "relative-day" };
    if (unit === "month") return { label: target.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), ...monthRange(target.getUTCFullYear(), target.getUTCMonth()), mode: "relative-month" };
    const year = target.getUTCFullYear();
    return { label: String(year), from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)), mode: "relative-year" };
  }

  const namedMonth = [...MONTHS.entries()].find(([name]) => clean.includes(name));
  const yearMatch = clean.match(/\b(20\d{2})\b/);
  if (namedMonth) {
    let year = yearMatch ? Number(yearMatch[1]) : now.getUTCFullYear();
    if (!yearMatch && namedMonth[1] > now.getUTCMonth()) year -= 1;
    return { label: `${namedMonth[0][0].toUpperCase()}${namedMonth[0].slice(1)} ${year}`, ...monthRange(year, namedMonth[1]), mode: "month" };
  }

  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return { label: String(year), from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)), mode: "year" };
  }

  return { label: "All real place history", from: new Date(0), to: now, mode: "all" };
}

function detectPersonQuery(query = "") {
  const clean = String(query || "").trim();
  const patterns = [
    /\b(?:meet|met|with|visited|saw|where did i meet)\s+([A-Za-z][A-Za-z.'-]{2,}(?:\s+[A-Za-z][A-Za-z.'-]{2,})?)\b/i,
    /\bplaces?\s+visited\s+with\s+([A-Za-z][A-Za-z.'-]{2,}(?:\s+[A-Za-z][A-Za-z.'-]{2,})?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return titleCase(match[1]);
  }
  return "";
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractPeople(text = "") {
  const people = [];
  const patterns = [
    /\b(?:with|met|meet|meeting|lunch with|dinner with|coffee with|worked with|visited with|travel(?:ed)? with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:helped|called|messaged|met|joined|visited|supported|inspired|discussed)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of String(text || "").matchAll(pattern)) {
      const name = titleCase(match[1]);
      if (name.length >= 3 && !/^(Google|Openai|NeuroNest|Render|Github|Starbucks|Cafe|Restaurant|Airport|Hotel)$/i.test(name)) {
        people.push(name);
      }
    }
  }
  return [...new Set(people)];
}

function relationshipPeopleBySource(relationships = {}) {
  const map = new Map();
  for (const event of relationships.events || relationships.relationshipEvents || []) {
    const sourceId = String(event.sourceId || event.source_id || event.source_id || "");
    const person = titleCase(event.personName || event.person_name || event.name || "");
    if (!sourceId || !person) continue;
    const list = map.get(sourceId) || [];
    list.push(person);
    map.set(sourceId, [...new Set(list)]);
  }
  return map;
}

function detectFilters(query = "") {
  const clean = String(query || "").toLowerCase();
  const travel = /\btravel history|trip history|journey|places visited|visited cities|atlas\b/i.test(query);
  const topics = TOPIC_PATTERNS
    .filter(([, pattern]) => pattern.test(clean))
    .map(([label]) => label)
    .filter((label) => !(travel && label === "Travel"));
  return {
    categories: CATEGORY_PATTERNS.filter(([label, pattern]) => pattern.test(clean) || clean.includes(label.toLowerCase())).map(([label]) => label),
    topics,
    person: detectPersonQuery(query),
    happiest: /\bhappiest|happy|best mood|felt best|where was i happy\b/i.test(query),
    topCity: /\bwhich city|most memories|most memory|city has\b/i.test(query),
    travel,
    startupJourney: /\bstartup journey|startup phase|neuronest journey\b/i.test(clean),
  };
}

function inPeriod(item, period) {
  const date = asDate(timestampOf(item));
  return date && date >= period.from && date <= period.to;
}

function confidenceFromEvidence(count, bonus = 0) {
  if (!count) return 0;
  return clamp(42 + count * 8 + bonus, 42, 95);
}

function normalizedRecords({ memories = [], records = [], chats = [], timeline = [] } = {}) {
  const rows = [
    ...memories.map((item) => ({ ...item, sourceBucket: item.sourceBucket || "memory" })),
    ...records.map((item) => ({ ...item, sourceBucket: item.sourceBucket || "record" })),
    ...chats.map((chat, index) => ({
      ...chat,
      id: chat.id || `chat_${index}`,
      title: chat.role === "user" ? "User conversation memory" : "AI assistant response",
      content: chat.content || chat.message || "",
      type: "ai-chat",
      timestamp: chat.createdAt || chat.timestamp,
      sourceBucket: "chat",
    })),
    ...timeline.map((event, index) => ({
      ...event,
      id: event.id || `timeline_${index}`,
      title: event.title || "Timeline event",
      content: event.description || event.aiSummary || "",
      type: event.type || "timeline",
      timestamp: event.timestamp || event.createdAt,
      sourceBucket: "timeline",
    })),
  ].filter((item) => textOf(item) && asDate(timestampOf(item)));

  return uniqueBy(rows, (item) => String(item.memoryId || item.id || `${item.sourceBucket}_${textOf(item).slice(0, 60)}_${timestampOf(item)}`), 5000);
}

function exactPlaceKeys(item = {}) {
  return [
    item.placeId,
    item.metadata?.placeId,
    normalizeKey(item.placeName || item.name || item.metadata?.placeName || item.title),
    normalizeKey(item.address || item.metadata?.address || item.location?.label),
  ].filter(Boolean);
}

function buildKnownPlaceIndex(placeSignals) {
  const index = new Map();
  for (const signal of placeSignals) {
    for (const key of exactPlaceKeys(signal)) {
      if (!key) continue;
      index.set(String(key), signal);
    }
  }
  return index;
}

function sourceIdentityFor(item, coords) {
  const placeId = item.placeId || item.metadata?.placeId || item.location?.placeId;
  if (placeId) return `place_${placeId}`;
  return stableId(placeNameOf(item), item.address || item.location?.label, coords.latitude.toFixed(5), coords.longitude.toFixed(5));
}

function signalFromPlace(item = {}, index = 0, sourceBucket = "place", relationshipMap = new Map()) {
  const coords = coordinatesOf(item);
  if (!coords) return null;
  const text = textOf(item);
  const parts = addressParts(item);
  const id = sourceIdentityFor(item, coords);
  const sourceId = String(item.id || item.entryId || item.memoryId || `place_${index}`);
  return {
    id,
    sourceId,
    sourceBucket,
    placeId: item.placeId || item.metadata?.placeId || item.location?.placeId || null,
    name: placeNameOf(item),
    category: categoryOf(item),
    address: item.address || item.formattedAddress || item.location?.label || item.metadata?.address || "",
    latitude: coords.latitude,
    longitude: coords.longitude,
    city: parts.city,
    state: parts.state,
    country: parts.country,
    area: parts.area,
    timestamp: timestampOf(item),
    arrivalTime: item.arrivalTime || item.metadata?.arrivalTime || null,
    departureTime: item.departureTime || item.metadata?.departureTime || null,
    durationMinutes: Number(item.durationMinutes || item.metadata?.durationMinutes || 0) || null,
    rating: Number.isFinite(Number(item.rating || item.metadata?.rating)) ? Number(item.rating || item.metadata?.rating) : null,
    website: item.website || item.googleMapsUri || item.metadata?.website || item.metadata?.googleMapsUri || null,
    photoUrl: item.photoUrl || item.media?.fileUrl || item.fileUrl || item.metadata?.photoUrl || null,
    source: item.source || item.metadata?.source || sourceBucket,
    text,
    happinessScore: POSITIVE_WORDS.test(text) ? 90 : STRESS_WORDS.test(text) ? 28 : 52,
    productivityScore: PRODUCTIVE_WORDS.test(text) ? 86 : 45,
    stressScore: STRESS_WORDS.test(text) ? 82 : 16,
    people: [...new Set([...extractPeople(text), ...(relationshipMap.get(sourceId) || [])])],
    evidence: [evidenceItem(item, sourceBucket === "place" ? "real place memory with coordinates" : "memory with real coordinates")],
  };
}

function signalFromRecord(record, knownPlaceIndex, index, relationshipMap) {
  const coords = coordinatesOf(record);
  if (coords) return signalFromPlace(record, index, record.sourceBucket || "memory", relationshipMap);

  const text = textOf(record);
  const keys = exactPlaceKeys(record);
  let known = null;
  for (const key of keys) {
    known = knownPlaceIndex.get(String(key));
    if (known) break;
  }
  if (!known) {
    const textKey = normalizeKey(text);
    for (const [key, place] of knownPlaceIndex.entries()) {
      if (key.length >= 4 && textKey.includes(key)) {
        known = place;
        break;
      }
    }
  }
  if (!known) return null;

  const sourceId = String(record.id || record.entryId || record.memoryId || `record_${index}`);
  return {
    ...known,
    timestamp: timestampOf(record),
    arrivalTime: null,
    departureTime: null,
    durationMinutes: null,
    sourceBucket: record.sourceBucket || "memory",
    source: record.source || record.sourceBucket || "memory",
    text,
    happinessScore: POSITIVE_WORDS.test(text) ? 90 : STRESS_WORDS.test(text) ? 28 : known.happinessScore,
    productivityScore: PRODUCTIVE_WORDS.test(text) ? 86 : known.productivityScore,
    stressScore: STRESS_WORDS.test(text) ? 82 : known.stressScore,
    people: [...new Set([...known.people, ...extractPeople(text), ...(relationshipMap.get(sourceId) || [])])],
    evidence: [evidenceItem(record, `linked to real place: ${known.name}`)],
  };
}

function matchesSignalFilters(signal, filters) {
  const text = `${signal.text} ${signal.name} ${signal.category} ${signal.address} ${signal.city} ${signal.state} ${signal.country}`.toLowerCase();
  if (filters.startupJourney && !/\b(startup|saas|founder|business|launch|neuronest)\b/i.test(text)) return false;
  if (filters.categories.length && !filters.categories.some((category) => signal.category === category || text.includes(category.toLowerCase()))) return false;
  if (filters.topics.length && !filters.topics.some((topic) => TOPIC_PATTERNS.find(([label]) => label === topic)?.[1].test(text))) return false;
  if (filters.person && !signal.people.some((person) => normalizeKey(person) === normalizeKey(filters.person)) && !text.includes(normalizeKey(filters.person))) return false;
  return true;
}

function uniqueEvidence(evidence = [], limit = 8) {
  return uniqueBy(evidence, (item) => `${item.id}_${item.timestamp}_${item.reason}`, limit);
}

function aggregateSignals(signals = []) {
  const grouped = new Map();
  for (const signal of signals) {
    const key = signal.id;
    const existing = grouped.get(key) || {
      id: signal.id,
      placeId: signal.placeId,
      name: signal.name,
      category: signal.category,
      address: signal.address,
      latitude: signal.latitude,
      longitude: signal.longitude,
      city: signal.city,
      state: signal.state,
      country: signal.country,
      area: signal.area,
      rating: signal.rating,
      website: signal.website,
      photoUrl: signal.photoUrl,
      visitCount: 0,
      memoryCount: 0,
      sourceTypes: new Set(),
      categories: new Set(),
      people: new Set(),
      evidence: [],
      timestamps: [],
      happinessTotal: 0,
      productivityTotal: 0,
      stressTotal: 0,
      durationMinutes: 0,
    };
    existing.visitCount += signal.sourceBucket === "place" ? 1 : 0;
    existing.memoryCount += 1;
    existing.sourceTypes.add(signal.sourceBucket || signal.source || "memory");
    existing.categories.add(signal.category);
    signal.people.forEach((person) => existing.people.add(person));
    existing.evidence.push(...signal.evidence);
    existing.timestamps.push(signal.timestamp);
    existing.happinessTotal += signal.happinessScore;
    existing.productivityTotal += signal.productivityScore;
    existing.stressTotal += signal.stressScore;
    existing.durationMinutes += Number(signal.durationMinutes || 0);
    if (!existing.photoUrl && signal.photoUrl) existing.photoUrl = signal.photoUrl;
    if (!existing.website && signal.website) existing.website = signal.website;
    if (!existing.rating && signal.rating) existing.rating = signal.rating;
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .map((item) => {
      const count = Math.max(1, item.memoryCount);
      const sortedTimestamps = item.timestamps.map((time) => asDate(time)).filter(Boolean).sort((a, b) => a - b);
      return {
        id: item.id,
        placeId: item.placeId,
        name: item.name,
        category: item.category,
        categories: [...item.categories],
        address: item.address,
        latitude: item.latitude,
        longitude: item.longitude,
        city: item.city,
        state: item.state,
        country: item.country,
        area: item.area,
        rating: item.rating,
        website: item.website,
        photoUrl: item.photoUrl,
        visitCount: item.visitCount,
        memoryCount: item.memoryCount,
        sourceTypes: [...item.sourceTypes],
        people: [...item.people],
        firstVisit: sortedTimestamps[0]?.toISOString() || null,
        lastVisit: sortedTimestamps.at(-1)?.toISOString() || null,
        durationMinutes: item.durationMinutes || null,
        happinessScore: clamp(item.happinessTotal / count),
        productivityScore: clamp(item.productivityTotal / count),
        stressScore: clamp(item.stressTotal / count),
        evidence: uniqueEvidence(item.evidence, 10),
      };
    })
    .sort((a, b) => new Date(b.lastVisit || 0) - new Date(a.lastVisit || 0));
}

function groupPoints(points, key, labelFallback) {
  const map = new Map();
  for (const point of points) {
    const label = point[key] || labelFallback;
    const existing = map.get(label) || {
      id: stableId(key, label),
      label,
      type: key,
      memoryCount: 0,
      visitCount: 0,
      placeCount: 0,
      happinessScore: 0,
      productivityScore: 0,
      categories: new Set(),
      points: [],
    };
    existing.memoryCount += point.memoryCount;
    existing.visitCount += point.visitCount;
    existing.placeCount += 1;
    existing.happinessScore += point.happinessScore;
    existing.productivityScore += point.productivityScore;
    point.categories.forEach((category) => existing.categories.add(category));
    existing.points.push(point);
    map.set(label, existing);
  }
  return [...map.values()]
    .map((cluster) => ({
      ...cluster,
      categories: [...cluster.categories],
      happinessScore: clamp(cluster.happinessScore / Math.max(1, cluster.placeCount)),
      productivityScore: clamp(cluster.productivityScore / Math.max(1, cluster.placeCount)),
      topPlaces: cluster.points
        .slice()
        .sort((a, b) => b.memoryCount - a.memoryCount)
        .slice(0, 5)
        .map((point) => ({ id: point.id, name: point.name, category: point.category, memoryCount: point.memoryCount })),
      points: undefined,
    }))
    .sort((a, b) => b.memoryCount - a.memoryCount || b.placeCount - a.placeCount);
}

function countCategories(points) {
  const map = new Map();
  for (const point of points) {
    const existing = map.get(point.category) || { label: point.category, placeCount: 0, memoryCount: 0, visitCount: 0 };
    existing.placeCount += 1;
    existing.memoryCount += point.memoryCount;
    existing.visitCount += point.visitCount;
    map.set(point.category, existing);
  }
  return [...map.values()].sort((a, b) => b.memoryCount - a.memoryCount || b.placeCount - a.placeCount);
}

function buildAiAnswers(points, filters, period) {
  const answers = [];
  const positivePoints = points
    .filter((point) => point.happinessScore > 60)
    .sort((a, b) => b.happinessScore - a.happinessScore || b.memoryCount - a.memoryCount);
  if (positivePoints[0]) {
    answers.push({
      id: "where-happiest",
      type: "happiness",
      title: "Where you were happiest",
      answer: `${positivePoints[0].name} in ${positivePoints[0].city} has the strongest positive place signal.`,
      confidence: confidenceFromEvidence(positivePoints[0].evidence.length, positivePoints[0].happinessScore / 4),
      evidence: positivePoints[0].evidence.slice(0, 5),
    });
  }

  const cities = groupPoints(points, "city", "Unknown city");
  if (cities[0]) {
    answers.push({
      id: "most-memory-city",
      type: "city",
      title: "City with most memories",
      answer: `${cities[0].label} has ${cities[0].memoryCount} real location-linked memory signal${cities[0].memoryCount === 1 ? "" : "s"}.`,
      confidence: confidenceFromEvidence(cities[0].memoryCount, cities[0].placeCount * 3),
      evidence: points.filter((point) => point.city === cities[0].label).flatMap((point) => point.evidence).slice(0, 5),
    });
  }

  if (filters.person) {
    const matches = points.filter((point) => point.people.some((person) => normalizeKey(person) === normalizeKey(filters.person)) || point.evidence.some((item) => normalizeKey(item.title).includes(normalizeKey(filters.person))));
    if (matches.length) {
      answers.push({
        id: "where-met-person",
        type: "relationship-location",
        title: `Where you met ${filters.person}`,
        answer: `${filters.person} appears with ${matches[0].name} in ${matches[0].city}.`,
        confidence: confidenceFromEvidence(matches.flatMap((point) => point.evidence).length, 8),
        evidence: matches.flatMap((point) => point.evidence).slice(0, 6),
      });
    }
  }

  if (points.length) {
    const first = [...points].sort((a, b) => new Date(a.firstVisit || 0) - new Date(b.firstVisit || 0))[0];
    const last = [...points].sort((a, b) => new Date(b.lastVisit || 0) - new Date(a.lastVisit || 0))[0];
    answers.push({
      id: "travel-history",
      type: "travel",
      title: "Travel history",
      answer: `${period.label} includes ${points.length} real mapped place${points.length === 1 ? "" : "s"} from ${first?.city || "your first saved city"} to ${last?.city || "your latest saved city"}.`,
      confidence: confidenceFromEvidence(points.length),
      evidence: points.flatMap((point) => point.evidence).slice(0, 6),
    });
  }

  return answers;
}

function buildJourneys(points) {
  const chronological = [...points].sort((a, b) => new Date(a.firstVisit || a.lastVisit || 0) - new Date(b.firstVisit || b.lastVisit || 0));
  const journeys = [];
  for (let index = 0; index < chronological.length; index += 1) {
    const point = chronological[index];
    const previous = chronological[index - 1];
    journeys.push({
      id: stableId("journey", point.id, index),
      from: previous ? { id: previous.id, name: previous.name, city: previous.city, latitude: previous.latitude, longitude: previous.longitude } : null,
      to: { id: point.id, name: point.name, city: point.city, latitude: point.latitude, longitude: point.longitude },
      timestamp: point.firstVisit || point.lastVisit,
      label: previous ? `${previous.city} -> ${point.city}` : `Started at ${point.city}`,
      evidence: point.evidence.slice(0, 3),
    });
  }
  return journeys;
}

export function buildMemoryAtlas({
  user = {},
  query = "",
  from = "",
  to = "",
  memories = [],
  records = [],
  chats = [],
  places = [],
  relationships = {},
  timeline = [],
  now = new Date(),
} = {}) {
  const period = parsePeriod({ query, from, to, now });
  const filters = detectFilters(query);
  const relationshipMap = relationshipPeopleBySource(relationships);
  const placeSignals = uniqueBy(places, (place, index) => String(place.id || place.memoryId || place.placeId || index), 10000)
    .map((place, index) => signalFromPlace(place, index, "place", relationshipMap))
    .filter(Boolean);
  const knownPlaceIndex = buildKnownPlaceIndex(placeSignals);
  const recordSignals = normalizedRecords({ memories, records, chats, timeline })
    .map((record, index) => signalFromRecord(record, knownPlaceIndex, index, relationshipMap))
    .filter(Boolean);
  const signals = [...placeSignals, ...recordSignals]
    .filter((signal) => inPeriod(signal, period))
    .filter((signal) => matchesSignalFilters(signal, filters));
  const mapPoints = aggregateSignals(signals);
  const locationClusters = {
    countries: groupPoints(mapPoints, "country", "Unknown country"),
    states: groupPoints(mapPoints, "state", "Unknown state"),
    cities: groupPoints(mapPoints, "city", "Unknown city"),
    areas: groupPoints(mapPoints, "area", "Unknown area"),
  };
  const categoryBreakdown = countCategories(mapPoints);
  const aiAnswers = buildAiAnswers(mapPoints, filters, period);
  const topCity = locationClusters.cities[0] || null;
  const happiest = aiAnswers.find((answer) => answer.id === "where-happiest") || null;

  return {
    version: "NeuroNest Memory Atlas v1",
    generatedAt: nowIso(),
    userId: user.id || null,
    query,
    period: {
      label: period.label,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      mode: period.mode,
    },
    filters,
    empty: mapPoints.length === 0,
    overview: {
      mapPointCount: mapPoints.length,
      placeMemoryCount: placeSignals.length,
      cityCount: locationClusters.cities.length,
      countryCount: locationClusters.countries.length,
      categoryCount: categoryBreakdown.length,
      evidenceCount: mapPoints.reduce((sum, point) => sum + point.evidence.length, 0),
      happiestPlace: happiest?.answer || "",
      topCity: topCity ? `${topCity.label} (${topCity.memoryCount})` : "",
    },
    mapPoints,
    locationClusters,
    categoryBreakdown,
    timeTravel: {
      label: period.label,
      points: mapPoints.slice().sort((a, b) => new Date(a.firstVisit || a.lastVisit || 0) - new Date(b.firstVisit || b.lastVisit || 0)),
      journeys: buildJourneys(mapPoints),
    },
    aiAnswers,
    evidencePolicy: "Memory Atlas uses only records with real coordinates or memories linked to a stored real place. It does not fabricate locations, trips, or map points.",
  };
}

export function answerMemoryAtlasQuery(query = "", atlas = {}) {
  const clean = String(query || "").toLowerCase();
  const matched = /\b(where|city|map|atlas|travel|visited|places?|restaurant|cafe|gym|hotel|airport|park|office|happiest|meet|met)\b/i.test(clean);
  if (!matched) return { matched: false, confidence: 0, answer: "", evidence: [] };
  if (atlas.empty || !atlas.mapPoints?.length) {
    return {
      matched: true,
      confidence: 0,
      answer: "Memory Atlas has no real mapped place evidence for that question yet. It will answer once your place memories or location-linked memories contain real coordinates.",
      evidence: [],
    };
  }

  const answerType =
    /\bhappiest|happy|mood\b/.test(clean)
      ? "happiness"
      : /\bwhich city|most memories|city has\b/.test(clean)
        ? "city"
        : /\bmeet|met|with\b/.test(clean)
          ? "relationship-location"
          : /\btravel|history|journey|visited\b/.test(clean)
            ? "travel"
            : "";
  const selected = answerType
    ? atlas.aiAnswers?.find((answer) => answer.type === answerType)
    : atlas.aiAnswers?.[0];

  if (selected) {
    return {
      matched: true,
      confidence: selected.confidence,
      answer: `${selected.answer} Confidence: ${selected.confidence}%.`,
      evidence: selected.evidence || [],
    };
  }

  const topPoint = atlas.mapPoints[0];
  return {
    matched: true,
    confidence: confidenceFromEvidence(topPoint.evidence?.length || 1),
    answer: `I found ${atlas.mapPoints.length} real mapped place${atlas.mapPoints.length === 1 ? "" : "s"}. Latest: ${topPoint.name} in ${topPoint.city}.`,
    evidence: topPoint.evidence || [],
  };
}
