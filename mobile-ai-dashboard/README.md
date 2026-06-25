# NeuroNest Mobile Dashboard

Premium mobile web app for NeuroNest.

This app does not create a separate fake database. In production, set
`NEURONEST_API_BASE_URL` or `NEURONEST_APP_URL` to the deployed PC NeuroNest
backend so mobile, PC, Supabase/warehouse, and Super Admin all share the same
real users and records. Production mode refuses protected data APIs when that
shared backend URL is missing.

## Local Run

Start the PC backend first on `http://127.0.0.1:3000`, then run mobile:

```text
npm start
```

Open:

```text
http://127.0.0.1:3002
```

For Google login locally, add these OAuth origins in Google Cloud:

```text
http://127.0.0.1:3002
http://localhost:3002
```

## Mobile Screens

- Home Dashboard
- AI Chat
- Memory Hub
- Map View / Place Hunter / Passive Places
- Memory Graph
- Life Replay
- Life OS Systems Hub
- Settings & Privacy
- Profile / Identity Hub

## PC Feature Parity

The Life OS Systems Hub exposes the same real PC feature groups:

- AI Memory Search
- Screenshot Memory AI
- Voice Memory
- Passive Place Memory
- Timeline / Replay / Time Machine
- Memory Atlas
- Digital Twin V4
- Relationship Intelligence
- Future Prediction Engine
- AI Chief of Staff
- Decision Intelligence
- Opportunity Engine
- Future Self Simulator
- Autonomous Capture
- Autonomous Life Agent
- Board of Advisors
- Personal Knowledge Universe
- Life Decision Engine
- Legacy Engine
- Security/account status
- Super Admin sync through the shared backend

## Required Production Environment

```text
NODE_ENV=production
SESSION_SECRET=long-random-secret
GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
NEURONEST_API_BASE_URL=https://your-pc-service.onrender.com
NEURONEST_APP_URL=https://your-pc-service.onrender.com
NEURONEST_MOBILE_URL=https://your-mobile-service.onrender.com
NEURONEST_ADMIN_URL=https://your-admin-service.onrender.com
OPENAI_API_KEY=only-if-running-mobile-standalone
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ALLOW_LOCAL_AI_FALLBACK=false
SUPABASE_URL=only-if-running-mobile-standalone
SUPABASE_SERVICE_ROLE_KEY=only-if-running-mobile-standalone
SUPABASE_MEDIA_BUCKET=neuronest-media
RATE_LIMIT_PER_MINUTE=120
MAX_REQUEST_BODY_BYTES=25000000
```

Do not commit `.env`, OpenAI keys, Groq keys, Supabase service role keys, or
Google secrets. Keep private AI/database keys on the backend Render services.
