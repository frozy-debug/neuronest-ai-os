# Deploy NeuroNest Mobile On Render

Use this folder as the mobile app:

```text
mobile-ai-dashboard/
```

The mobile app is a separate Render service, but it proxies real authenticated API
traffic to the PC NeuroNest backend through `NEURONEST_API_BASE_URL`. That keeps
PC, mobile, Supabase/warehouse, and Super Admin on the same data source.
In production, the mobile service refuses protected data APIs if this shared PC
backend URL is missing, so it cannot accidentally create isolated mobile-only
records.

## Render Web Service

Because the repository contains multiple apps, create the service from the full
GitHub repository and use:

```text
Root Directory: leave empty
Build Command: cd mobile-ai-dashboard && npm install
Start Command: node mobile-ai-dashboard/server.js
Health Check Path: /api/health
```

Do not set `PORT`; Render provides it automatically.

## Environment Variables

Required on the mobile Render service:

```text
NODE_ENV=production
SESSION_SECRET=make-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_IDS=optional-extra-google-web-client-ids
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
NEURONEST_API_BASE_URL=https://your-pc-service.onrender.com
NEURONEST_APP_URL=https://your-pc-service.onrender.com
NEURONEST_MOBILE_URL=https://your-mobile-service.onrender.com
NEURONEST_ADMIN_URL=https://your-admin-service.onrender.com
OPENAI_API_KEY=keep-on-pc-backend-unless-mobile-standalone
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ALLOW_LOCAL_AI_FALLBACK=false
SUPABASE_URL=keep-on-pc-backend-unless-mobile-standalone
SUPABASE_SERVICE_ROLE_KEY=keep-on-pc-backend-unless-mobile-standalone
SUPABASE_MEDIA_BUCKET=neuronest-media
RATE_LIMIT_PER_MINUTE=120
MAX_REQUEST_BODY_BYTES=25000000
```

Keep OpenAI, Groq, Supabase service role, pgvector, and private AI keys on the
PC backend Render service unless you intentionally run mobile in standalone
backend mode. In the shared-backend setup, mobile calls PC APIs and never exposes
private AI/database keys to the browser.

If you copy environment variables from `neuronest-ai-os` to
`neuronest-ai-os-mobile`, copy only server-side Render variables. Never place
OpenAI, Groq, Supabase service role, or Google client secret values inside
`public/index.html` or any frontend file.

## Google OAuth

Fix `origin_mismatch` by adding every active origin to the same Google OAuth Web
Client used by NeuroNest.

Local development origins:

```text
http://127.0.0.1:3002
http://localhost:3002
```

Production origins:

```text
https://your-mobile-service.onrender.com
https://your-pc-service.onrender.com
https://your-admin-service.onrender.com
```

Do not add a trailing `/`.

## Google Maps Key

Add these website restrictions to the Maps browser key:

```text
http://127.0.0.1:3002/*
http://localhost:3002/*
https://your-mobile-service.onrender.com/*
https://your-pc-service.onrender.com/*
```

Enable:

```text
Maps JavaScript API
Places API
Places API (New)
Geocoding API
```

## Smoke Tests

After deploy:

```text
GET https://your-mobile-service.onrender.com/api/health
GET https://your-mobile-service.onrender.com/api/config
```

Then verify:

1. Google login works.
2. Create a memory on mobile.
3. Confirm the memory appears in PC.
4. Confirm the memory appears in Super Admin.
5. Upload screenshot on mobile.
6. Record voice note on mobile.
7. Enable passive place memory while the app is open.
8. Check Relationship, Future Intelligence, Replay, Atlas, Digital Twin, and Life OS screens.
9. Confirm no secrets appear in browser source or network JSON.
