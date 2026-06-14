# NeuroNest AI Core V2 Production Audit

## Scope

- Main application: `pc-ai-dashboard/`
- Super Admin: `neuronest-super-admin/`
- Shared data layer: `shared/neuronest-warehouse/`

## Production Changes Completed

### Mock and UI-only behavior removed

- Removed the six demo memories that were injected into every AI calculation.
- Removed the hardcoded legacy chatbot and demo answers.
- Removed default fake Life OS goals.
- Replaced silent hash embeddings with explicit provider errors.
- Legacy local fallback vectors are ignored unless `ALLOW_LOCAL_AI_FALLBACK=true`.
- Replaced fake UI scores, goals, stream events, and counters with real-data empty states.
- Home feed, moments, recent memories, and weekly recap now render from stored entries.

### Real AI pipelines

- AI Chat requires OpenAI and uses the user's real semantic memory context.
- Screenshot uploads now send the real image to the backend.
- Screenshot AI uses OpenAI vision, stores the image, creates a memory record, generates a real embedding, and becomes semantically searchable.
- Voice Assistant records audio where browser permission/API support exists.
- Voice AI stores audio, transcribes with OpenAI, analyzes the transcript, creates a memory, adds a timeline event, and creates an embedding.
- Semantic search requires real OpenAI embeddings. It no longer falls back to keyword search while claiming semantic behavior.

### Real storage and synchronization

- Shared warehouse schema now stores:
  - embeddings
  - relationships
  - Digital Twin snapshots
  - predictions
  - replays
  - insights
  - AI jobs
  - AI usage
- Added `supabase_production_schema.sql`.
- Added a Supabase production mirror for users, memories, chats, goals, timeline records, media, intelligence snapshots, and AI usage.
- Uploaded screenshot/audio files can be stored in the private `neuronest-media` Supabase Storage bucket.
- Super Admin polls the same Supabase source and hydrates its live warehouse automatically.
- Super Admin metrics and database explorer now count real warehouse records.

### Evidence-backed intelligence

- Digital Twin, relationships, predictions, replay, and insights persist automatically after memory/chat interactions.
- Removed evidence-free confidence floors from:
  - Insight Engine
  - Relationship Engine
  - Pattern Analysis Engine
  - Productivity Recall Engine
  - Intelligence Core
  - Learning Engine
  - User Brain Model
  - Memory DNA/Profile Identity
  - Life OS
- Empty or insufficient evidence now produces zero/unknown values instead of invented percentages.

## Production API Endpoints

- `POST /api/chat` - real OpenAI contextual chat
- `POST /api/ai/search` - real embedding semantic search
- `POST /api/ai/screenshot-memory` - image storage, vision analysis, embedding, timeline
- `POST /api/ai/voice-memory` - audio storage, transcription, analysis, embedding, timeline
- `GET /api/ai/digital-twin` - persisted Digital Twin snapshot
- `GET /api/ai/relationships` - persisted relationship graph
- `GET /api/ai/predictions` - persisted predictions
- `GET /api/ai/replay` - persisted replay
- `GET /api/ai/status` and `/api/health` - honest provider/readiness status

## Required Production Configuration

Run `pc-ai-dashboard/supabase_production_schema.sql` in Supabase, then configure both Render services with the same:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_MEDIA_BUCKET=neuronest-media
```

Configure the PC dashboard:

```env
NODE_ENV=production
OPENAI_API_KEY=your-openai-api-key
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ALLOW_LOCAL_AI_FALLBACK=false
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_MAPS_API_KEY=your-maps-key
NEURONEST_APP_URL=https://your-pc-service.onrender.com
```

Configure Super Admin:

```env
NODE_ENV=production
GOOGLE_CLIENT_ID=your-admin-web-client-id
SUPER_ADMIN_EMAILS=owner@example.com
NEURONEST_APP_URL=https://your-pc-service.onrender.com
ADMIN_PRODUCTION_SYNC_MS=15000
```

OpenAI Plus/ChatGPT Plus does not include API usage. A separately billed OpenAI API key is required.

## Honest Limitations

- Real OpenAI and Supabase network calls were not executed during this local verification because those providers are not configured in the current environment.
- Browser/OS-wide autonomous capture cannot happen silently from a normal website. Clipboard, microphone, location, and screenshot capture remain permission-based.
- Existing local JSON records remain supported for development and migration, but separate Render services must use Supabase to share production data.
- Supabase Storage files are private. A future download/view endpoint should create signed URLs when private media previews are needed in Super Admin.

## Verification Completed

- Syntax checked all PC backend services.
- Syntax checked all shared warehouse services.
- Syntax checked Super Admin backend.
- Parsed all PC frontend inline scripts.
- PC smoke test: HTTP 200 on port `3099`.
- Super Admin smoke test: HTTP 200 on port `3199`.
- Health check correctly reports OpenAI/Supabase unavailable and reports zero usable legacy fallback vectors.
