import crypto from "node:crypto";

export const PASSIVE_PLACE_DEFAULTS = Object.freeze({
  enabled: false,
  minimumStayMinutes: 10,
  movementRadiusMeters: 100,
  maximumAccuracyMeters: 250,
  ignoreHome: true,
  ignoreWork: true,
  ignoreSchool: true,
  excludedLocations: [],
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validTimestamp(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const earthRadius = 6_371_000;
  const lat1 = (Number(a.latitude) * Math.PI) / 180;
  const lat2 = (Number(b.latitude) * Math.PI) / 180;
  const deltaLat = ((Number(b.latitude) - Number(a.latitude)) * Math.PI) / 180;
  const deltaLng = ((Number(b.longitude) - Number(a.longitude)) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function normalizePassivePlaceSettings(settings = {}) {
  const excludedLocations = Array.isArray(settings.excludedLocations)
    ? settings.excludedLocations
        .map((item) => ({
          id: String(item.id || crypto.randomUUID()),
          label: String(item.label || "Excluded location").slice(0, 80),
          kind: String(item.kind || "custom").toLowerCase().slice(0, 30),
          latitude: asFiniteNumber(item.latitude ?? item.lat),
          longitude: asFiniteNumber(item.longitude ?? item.lng),
          radiusMeters: clamp(asFiniteNumber(item.radiusMeters, 150), 50, 2_000),
        }))
        .filter((item) => Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180)
        .slice(0, 50)
    : [];

  return {
    ...PASSIVE_PLACE_DEFAULTS,
    ...settings,
    enabled: settings.enabled === true,
    minimumStayMinutes: clamp(asFiniteNumber(settings.minimumStayMinutes, 10), 10, 240),
    movementRadiusMeters: clamp(asFiniteNumber(settings.movementRadiusMeters, 100), 50, 500),
    maximumAccuracyMeters: clamp(asFiniteNumber(settings.maximumAccuracyMeters, 250), 25, 1_000),
    ignoreHome: settings.ignoreHome !== false,
    ignoreWork: settings.ignoreWork !== false,
    ignoreSchool: settings.ignoreSchool !== false,
    excludedLocations,
  };
}

export function sanitizeLocationSample(sample = {}) {
  const latitude = asFiniteNumber(sample.latitude ?? sample.lat, NaN);
  const longitude = asFiniteNumber(sample.longitude ?? sample.lng, NaN);
  const accuracy = clamp(asFiniteNumber(sample.accuracy, 100), 0, 10_000);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error("Valid latitude and longitude are required.");
  }
  return {
    id: crypto.randomUUID(),
    latitude,
    longitude,
    accuracy,
    altitude: Number.isFinite(Number(sample.altitude)) ? Number(sample.altitude) : null,
    speed: Number.isFinite(Number(sample.speed)) ? Number(sample.speed) : null,
    heading: Number.isFinite(Number(sample.heading)) ? Number(sample.heading) : null,
    recordedAt: validTimestamp(sample.recordedAt || sample.timestamp),
    source: String(sample.source || "browser-geolocation").slice(0, 60),
  };
}

export function findExcludedLocation(sample, settings) {
  return settings.excludedLocations.find((location) => {
    if (location.kind === "home" && !settings.ignoreHome) return false;
    if (location.kind === "work" && !settings.ignoreWork) return false;
    if (location.kind === "school" && !settings.ignoreSchool) return false;
    return distanceMeters(sample, location) <= location.radiusMeters;
  }) || null;
}

function buildVisit(userId, state, departureTime) {
  const arrivalMs = new Date(state.arrivalTime).getTime();
  const departureMs = new Date(departureTime).getTime();
  return {
    id: crypto.randomUUID(),
    userId,
    placeId: null,
    placeName: null,
    category: null,
    address: null,
    latitude: state.anchor.latitude,
    longitude: state.anchor.longitude,
    arrivalTime: state.arrivalTime,
    departureTime,
    durationMinutes: Math.max(1, Math.round((departureMs - arrivalMs) / 60_000)),
    rating: null,
    website: null,
    openingHours: null,
    photoUrl: null,
    photoAttributions: [],
    source: "AUTOMATIC",
    metadataStatus: "pending",
    sampleCount: state.sampleCount,
    maxDistanceMeters: Math.round(state.maxDistanceMeters || 0),
    createdAt: new Date().toISOString(),
  };
}

function queueVisitMetadata(db, visit) {
  db.warehouse.placeMetadataQueue.unshift({
    id: `place-metadata-${visit.id}`,
    userId: visit.userId,
    visitId: visit.id,
    status: "pending",
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  db.warehouse.placeMetadataQueue = db.warehouse.placeMetadataQueue.slice(0, 5_000);
}

export function finalizePassivePlaceState(db, userId, rawSettings = {}, departureTime = null) {
  const settings = normalizePassivePlaceSettings(rawSettings);
  db.warehouse.passivePlaceStates ||= {};
  db.warehouse.placeMetadataQueue ||= [];
  const state = db.warehouse.passivePlaceStates[userId];
  if (!state) return { status: "no-active-visit", visit: null };
  const finalDeparture = validTimestamp(departureTime || state.lastSeenAt);
  const durationMinutes = Math.max(0, (new Date(finalDeparture) - new Date(state.arrivalTime)) / 60_000);
  delete db.warehouse.passivePlaceStates[userId];
  if (durationMinutes < settings.minimumStayMinutes) return { status: "short-stop-discarded", visit: null };
  const visit = buildVisit(userId, state, finalDeparture);
  queueVisitMetadata(db, visit);
  return { status: "visit-completed", visit };
}

export function processPassiveLocationSample(db, userId, rawSample, rawSettings = {}) {
  const settings = normalizePassivePlaceSettings(rawSettings);
  const sample = sanitizeLocationSample(rawSample);
  db.warehouse.locationSamples ||= [];
  db.warehouse.passivePlaceStates ||= {};
  db.warehouse.placeMetadataQueue ||= [];

  if (!settings.enabled) return { status: "disabled", sampleStored: false, visit: null };
  if (sample.accuracy > settings.maximumAccuracyMeters) {
    return { status: "accuracy-rejected", sampleStored: false, visit: null, accuracy: sample.accuracy };
  }

  const excluded = findExcludedLocation(sample, settings);
  if (excluded) {
    delete db.warehouse.passivePlaceStates[userId];
    return { status: "excluded", sampleStored: false, visit: null, excludedLabel: excluded.label };
  }

  db.warehouse.locationSamples.unshift({ ...sample, userId });
  db.warehouse.locationSamples = db.warehouse.locationSamples.slice(0, 20_000);
  const state = db.warehouse.passivePlaceStates[userId];
  if (!state) {
    db.warehouse.passivePlaceStates[userId] = {
      anchor: sample,
      arrivalTime: sample.recordedAt,
      lastSeenAt: sample.recordedAt,
      sampleCount: 1,
      maxDistanceMeters: 0,
    };
    return { status: "arrival-candidate", sampleStored: true, visit: null };
  }

  const movement = distanceMeters(state.anchor, sample);
  if (movement <= settings.movementRadiusMeters) {
    state.lastSeenAt = sample.recordedAt;
    state.sampleCount += 1;
    state.maxDistanceMeters = Math.max(Number(state.maxDistanceMeters || 0), movement);
    const dwellMinutes = Math.max(0, (new Date(state.lastSeenAt) - new Date(state.arrivalTime)) / 60_000);
    return {
      status: dwellMinutes >= settings.minimumStayMinutes ? "visit-confirmed-awaiting-departure" : "dwelling",
      sampleStored: true,
      visit: null,
      dwellMinutes: Math.round(dwellMinutes),
    };
  }

  const durationMinutes = Math.max(0, (new Date(state.lastSeenAt) - new Date(state.arrivalTime)) / 60_000);
  const visit =
    durationMinutes >= settings.minimumStayMinutes
      ? buildVisit(userId, state, state.lastSeenAt)
      : null;

  db.warehouse.passivePlaceStates[userId] = {
    anchor: sample,
    arrivalTime: sample.recordedAt,
    lastSeenAt: sample.recordedAt,
    sampleCount: 1,
    maxDistanceMeters: 0,
  };
  if (visit) {
    queueVisitMetadata(db, visit);
  }
  return { status: visit ? "visit-completed" : "short-stop-discarded", sampleStored: true, visit };
}

function googleFieldText(value) {
  return typeof value === "string" ? value : String(value?.text || "");
}

export async function resolveGooglePlaceVisit(visit, apiKey) {
  if (!apiKey) throw new Error("GOOGLE_PLACES_SERVER_API_KEY is not configured.");
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.primaryType",
        "places.primaryTypeDisplayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.websiteUri",
        "places.regularOpeningHours",
        "places.photos",
        "places.googleMapsUri",
      ].join(","),
    },
    body: JSON.stringify({
      maxResultCount: 10,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: visit.latitude, longitude: visit.longitude },
          radius: 100,
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Google Places lookup failed (${response.status}).`);
  const candidates = (payload.places || [])
    .map((place) => ({
      place,
      distance: distanceMeters(visit, {
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
      }),
    }))
    .filter((candidate) => candidate.distance <= 100)
    .sort((a, b) => a.distance - b.distance);
  const match = candidates[0];
  if (!match) {
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${visit.latitude},${visit.longitude}`)}&key=${encodeURIComponent(apiKey)}`,
    );
    const geocode = await geocodeResponse.json().catch(() => ({}));
    if (!geocodeResponse.ok || geocode.status !== "OK" || !geocode.results?.[0]) {
      throw new Error(geocode.error_message || "Google Places and Geocoding returned no identifiable location.");
    }
    const result = geocode.results[0];
    return {
      ...visit,
      address: result.formatted_address || null,
      category: "Location",
      geocodingPlaceId: result.place_id || null,
      metadataStatus: "resolved-address-only",
      metadataResolvedAt: new Date().toISOString(),
    };
  }
  const place = match.place;
  return {
    ...visit,
    placeId: place.id || null,
    placeName: googleFieldText(place.displayName) || null,
    category: googleFieldText(place.primaryTypeDisplayName) || place.primaryType || null,
    address: place.formattedAddress || null,
    latitude: Number(place.location?.latitude ?? visit.latitude),
    longitude: Number(place.location?.longitude ?? visit.longitude),
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    website: place.websiteUri || place.googleMapsUri || null,
    openingHours: place.regularOpeningHours?.weekdayDescriptions || null,
    googleMapsUri: place.googleMapsUri || null,
    photoName: place.photos?.[0]?.name || null,
    photoAttributions: place.photos?.[0]?.authorAttributions || [],
    metadataStatus: "resolved",
    metadataResolvedAt: new Date().toISOString(),
  };
}

export async function downloadGooglePlacePhoto(photoName, apiKey) {
  if (!photoName || !apiKey) return null;
  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=false&key=${encodeURIComponent(apiKey)}`,
    { redirect: "follow" },
  );
  if (!response.ok) throw new Error(`Google Place Photo download failed (${response.status}).`);
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("Google Place Photo did not return an image.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Google Place Photo returned an empty image.");
  return {
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    fileName: `google-place-${crypto.randomUUID()}.${mimeType.includes("png") ? "png" : "jpg"}`,
    mimeType,
    size: bytes.length,
  };
}

export function buildAutomaticPlaceMemoryPayload(visit, photoPayload = null) {
  const placeName = visit.placeName || "Visited location";
  const duration = `${visit.durationMinutes} minute${visit.durationMinutes === 1 ? "" : "s"}`;
  const coordinateLabel = `${Number(visit.latitude).toFixed(5)}, ${Number(visit.longitude).toFixed(5)}`;
  return {
    kind: "place",
    type: "place",
    source: "AUTOMATIC",
    title: `Visited ${placeName}`,
    body: `Stayed ${duration}${visit.address ? ` at ${visit.address}` : ` near ${coordinateLabel}`}.`,
    summary: `Automatic place memory: ${placeName}, ${duration}.`,
    meta: visit.category || "Automatic place visit",
    tags: ["automatic", "place", visit.category || "location"].filter(Boolean).join(","),
    location: {
      lat: visit.latitude,
      lng: visit.longitude,
      label: visit.address || visit.placeName || coordinateLabel,
      placeId: visit.placeId,
    },
    media: photoPayload
      ? { kind: "image", fileName: photoPayload.fileName, mimeType: photoPayload.mimeType }
      : null,
    imageData: photoPayload?.dataUrl || null,
    fileName: photoPayload?.fileName || null,
    mimeType: photoPayload?.mimeType || null,
    storagePrefix: "places",
    createdAt: visit.departureTime,
    metadata: {
      passivePlaceVisit: true,
      visitId: visit.id,
      placeId: visit.placeId,
      placeName: visit.placeName,
      category: visit.category,
      address: visit.address,
      arrivalTime: visit.arrivalTime,
      departureTime: visit.departureTime,
      durationMinutes: visit.durationMinutes,
      rating: visit.rating,
      website: visit.website,
      openingHours: visit.openingHours,
      googleMapsUri: visit.googleMapsUri,
      photoAttributions: visit.photoAttributions,
      metadataStatus: visit.metadataStatus,
      source: "AUTOMATIC",
    },
  };
}
