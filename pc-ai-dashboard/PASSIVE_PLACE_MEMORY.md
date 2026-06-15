# Passive Place Memory Production Setup

NeuroNest records only authenticated, permission-based GPS samples. Tracking is
off by default. The browser collector operates while NeuroNest is open; a
future native mobile client can send significant-change/background samples to
the same authenticated API.

## Required Google APIs

Enable these APIs in the Google Cloud project:

- Places API (New)
- Geocoding API
- Maps JavaScript API

Use two restricted keys:

- `GOOGLE_MAPS_API_KEY`: browser key restricted to NeuroNest website origins.
- `GOOGLE_PLACES_SERVER_API_KEY`: backend key used for Places, Geocoding, and
  official Place Photo downloads. Do not expose this key in frontend code.

## Required Supabase Setup

Run `supabase_production_schema.sql` in the Supabase SQL Editor. It creates the
`place_memories` table and enables RLS. Keep `SUPABASE_SERVICE_ROLE_KEY` only on
the backend.

The backend uploads official Google Place Photos into:

`places/{userId}/{memoryId}/`

inside the configured `SUPABASE_MEDIA_BUCKET`.

## Runtime Behavior

- Minimum dwell time: 10 minutes.
- Movement radius: 100 meters.
- Inaccurate GPS samples are rejected.
- Home, Work, School, and custom locations can be excluded before samples are
  stored.
- If Google enrichment fails, NeuroNest saves the coordinate-only visit and
  retries metadata later.
- Confirmed visits become unified place memories, timeline events, embeddings,
  Digital Twin signals, replay events, and Super Admin records.

## API

- `GET/PATCH /api/passive-places/settings`
- `POST /api/passive-places/samples`
- `POST /api/passive-places/flush`
- `GET /api/passive-places/visits`
- `POST /api/passive-places/retry`

All endpoints require an authenticated NeuroNest user session.
