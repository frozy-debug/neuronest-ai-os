# PC AI Dashboard Backend

This is the Google-only backend for your PC dashboard.

It gives you:

- Google sign in / sign up
- User session
- Logout
- Basic chat API
- Saved chat history in `data/db.json`

## Important

Do not open `public/index.html` directly.

You must run the backend and open:

```text
http://localhost:3000
```

## Start It

Open this folder:

```text
C:\Users\JAI\Documents\Codex\2026-05-17\files-mentioned-by-the-user-chatgpt\pc-ai-dashboard
```

Then double-click:

```text
OPEN_DASHBOARD.bat
```

## Open On Phone With Google Login

For phone login, use ngrok. Double-click:

```text
START_PHONE_GOOGLE_LOGIN.bat
```

Full guide:

```text
PHONE_GOOGLE_LOGIN.md
```

## Share With Friends

To give friends one public link where they can login with Google, deploy the app online.

Use:

```text
HOST_ON_RENDER.md
```

## Google Login Setup

Google login will not work until you add your real Google Client ID.

1. Go to Google Cloud Console.
2. Create or select a project.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID.
5. Choose **Web application**.
6. Add this Authorized JavaScript origin:

```text
http://localhost:3000
```

7. Copy the Client ID.
8. Copy `.env.example` to `.env`.
9. Paste the Client ID into `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
SESSION_SECRET=change-this-to-any-long-random-text
```

10. Restart the backend and open:

```text
http://localhost:3000
```

## Live Google Maps Setup

The full Map View uses Google Maps JavaScript API, browser geolocation, and nearby Places search.

1. In Google Cloud Console, enable **Maps JavaScript API** and **Places API**.
2. Create a browser API key in Google Maps Platform.
3. Restrict the key to this HTTP referrer:

```text
http://localhost:3000/*
```

4. Add it to `.env`:

```env
GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
```

5. Restart the backend, refresh the dashboard, open **Map View**, and allow location permission.

## Chat

After Google login, try:

```text
hi
hello
how are you
who are you
tell me about the cafe
help
```

Chat uses OpenAI plus the backend memory-intelligence layer for contextual retrieval. If OpenAI is not configured, the API returns a clear provider error instead of a fabricated answer.

## AI Second Brain Setup

NeuroNest now has a backend memory-intelligence layer:

- unified memory objects for entries, places, screenshots, voice notes, timeline, insights, replay, and chat
- OpenAI embeddings with `text-embedding-3-small`
- local cache for real OpenAI vectors during development
- optional Supabase pgvector storage for production
- semantic memory search
- dynamic relationships, memory scores, DNA profile, replay narration, and proactive AI insights
- Real Memory Timeline Engine with filters, clustering, streaks, replay events, and relationship-aware chronology
- multimodal screenshot and voice intelligence with OCR context, captions, tone detection, visual labels, and semantic embeddings

AI Chat, semantic search, screenshot analysis, voice transcription, and embeddings require `OPENAI_API_KEY`. A deterministic development vector can only be enabled explicitly with `ALLOW_LOCAL_AI_FALLBACK=true`; never enable it in production.

For real embeddings, add this to `.env`:

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

For Supabase pgvector:

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase_production_schema.sql`.
4. Add these backend-only env vars:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Never put OpenAI keys or Supabase service-role keys in `public/index.html`.
