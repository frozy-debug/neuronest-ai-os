# NeuroNest Modified Files and Render Deployment

## Line-count limitation

This workspace has no `.git` directory in the root or any application folder. Without a committed baseline, exact added and removed line counts cannot be calculated truthfully.

- `Added`: N/A (no baseline)
- `Removed`: N/A (no baseline)
- `Current lines`: measured from the current file

Initialize Git and commit the current state before the next development pass. After that, `git diff --numstat` will provide exact added and removed counts.

## Production-pass modified files

### PC application

| File | Added | Removed | Current lines | Purpose | Risk | How to test |
|---|---:|---:|---:|---|---|---|
| `pc-ai-dashboard/server.js` | N/A | N/A | 2067 | Connects authentication, real AI chat/search, screenshot/voice pipelines, timeline, intelligence persistence, health, and shared warehouse APIs. | High | Run `node --check server.js`, start service, test `/api/health`, login, chat, search, screenshot, and voice flows. |
| `pc-ai-dashboard/public/index.html` | N/A | N/A | 8888 | Replaces demo UI values with stored records and connects real backend AI/upload/search states. | High | Open dashboard after login; test memories, AI Chat, search, screenshot upload, voice recording, timeline, and empty states. |
| `pc-ai-dashboard/services/embeddingService.js` | N/A | N/A | 102 | Generates real OpenAI embeddings and disables silent fake-vector fallback in production. | High | Create/search a memory with OpenAI configured; confirm a 1536-dimension vector is persisted. |
| `pc-ai-dashboard/services/productionAiService.js` | N/A | N/A | 207 | Implements OpenAI vision, transcription, transcript analysis, and production AI readiness. | High | Upload a screenshot and voice note; confirm real description/transcript and stored records. |
| `pc-ai-dashboard/services/openAiIntelligenceService.js` | N/A | N/A | 87 | Produces contextual OpenAI assistant responses using memory evidence. | High | Ask AI Chat a question related to a saved memory and verify the answer references it. |
| `pc-ai-dashboard/services/vectorSearchService.js` | N/A | N/A | 169 | Stores vectors and performs Supabase pgvector cosine-similarity search. | High | Run the SQL schema, save memories, call semantic search, and verify relevant results. |
| `pc-ai-dashboard/services/digitalTwinService.js` | N/A | N/A | 236 | Builds evidence-backed Digital Twin snapshots from real user records. | Medium | Add several memories and confirm Digital Twin values change and persist. |
| `pc-ai-dashboard/services/insightEngine.js` | N/A | N/A | 114 | Generates insights only when supported by evidence; removes invented confidence floors. | Medium | Test with zero data and repeated real activity; confirm zero/unknown then evidence-backed insights. |
| `pc-ai-dashboard/services/relationshipEngine.js` | N/A | N/A | 99 | Detects and persists real memory relationships. | Medium | Create repeated related memories and verify relationship count/confidence increases. |
| `pc-ai-dashboard/services/patternAnalysisEngine.js` | N/A | N/A | 108 | Detects behavioral patterns from real historical activity. | Medium | Add repeated activity at similar times and verify detected patterns. |
| `pc-ai-dashboard/services/productivityRecallEngine.js` | N/A | N/A | 63 | Recalls evidence-backed productive sessions and routines. | Medium | Save focus/productivity entries and verify recall output references them. |
| `pc-ai-dashboard/services/intelligenceCoreService.js` | N/A | N/A | 165 | Aggregates the real personal intelligence model and provider status. | High | Call intelligence/status APIs with empty and populated accounts. |
| `pc-ai-dashboard/services/learningEngineService.js` | N/A | N/A | 401 | Learns preferences, languages, topics, patterns, and confidence from interactions. | High | Chat in multiple languages and repeat topics; verify learned profile updates. |
| `pc-ai-dashboard/services/lifeOsService.js` | N/A | N/A | 221 | Removes default fake goals and calculates Life OS state from real goals/activity. | Medium | Test with no goals, then create goals/tasks and confirm mission/alignment changes. |
| `pc-ai-dashboard/services/intelligenceConfidenceEngine.js` | N/A | N/A | 30 | Calculates confidence from available evidence rather than fixed values. | Medium | Compare confidence with zero, one, and repeated evidence records. |
| `pc-ai-dashboard/services/userBrainModelService.js` | N/A | N/A | 420 | Builds the user brain/knowledge model from real memories and behavior. | High | Add memories across categories and verify model topics/relationships update. |
| `pc-ai-dashboard/services/profileIdentityService.js` | N/A | N/A | 119 | Produces evidence-backed profile identity and analytics. | Medium | Open Profile with new and established users; verify values reflect stored data. |
| `pc-ai-dashboard/services/memoryDnaService.js` | N/A | N/A | 30 | Calculates Memory DNA values from real evidence. | Medium | Add varied memory types and verify DNA metrics change. |
| `pc-ai-dashboard/services/memoryScoringEngine.js` | N/A | N/A | 50 | Scores memory importance using real metadata and interaction evidence. | Medium | Save/revisit emotionally tagged memories and compare scores. |
| `pc-ai-dashboard/supabase_production_schema.sql` | N/A | N/A | 175 | Creates production tables, vector search function, indexes, and private media bucket support. | High | Run in a new Supabase project; verify tables, pgvector function, and bucket exist. |
| `pc-ai-dashboard/.env.example` | N/A | N/A | 36 | Documents required production environment variables without secrets. | Low | Compare against Render environment variables; never add real values here. |
| `pc-ai-dashboard/HOST_ON_RENDER.md` | N/A | N/A | 121 | Documents Render, Google OAuth, Maps, OpenAI, and Supabase deployment. | Low | Follow it using a staging Render service. |
| `pc-ai-dashboard/README.md` | N/A | N/A | 110 | Documents local use and production architecture. | Low | Review commands and verify links/settings match the deployment. |

### Shared production warehouse

| File | Added | Removed | Current lines | Purpose | Risk | How to test |
|---|---:|---:|---:|---|---|---|
| `shared/neuronest-warehouse/databaseService.js` | N/A | N/A | 188 | Expands the real shared warehouse schema for intelligence and AI usage records. | High | Start PC app, create records, restart, and verify persistence. |
| `shared/neuronest-warehouse/adminSyncService.js` | N/A | N/A | 224 | Builds real Admin analytics and synchronizes production records. | High | Create activity in PC app and verify it appears in Admin after polling. |
| `shared/neuronest-warehouse/index.js` | N/A | N/A | 86 | Exposes the shared warehouse services to both applications. | High | Start both apps and confirm imports and health endpoints succeed. |
| `shared/neuronest-warehouse/supabaseProductionStore.js` | N/A | N/A | 344 | Mirrors users, memories, chats, media, timelines, intelligence, and AI usage to Supabase. | High | Configure Supabase, create each record type, and query corresponding tables. |
| `shared/neuronest-warehouse/screenshotService.js` | N/A | N/A | 64 | Persists screenshot records linked to users and memories. | Medium | Upload screenshot and verify screenshot, memory, media, timeline, and vector records. |
| `shared/neuronest-warehouse/voiceNoteService.js` | N/A | N/A | 54 | Persists voice-note metadata, transcript, and user linkage. | Medium | Record voice and verify audio metadata, transcript, memory, and timeline record. |
| `shared/neuronest-warehouse/chatService.js` | N/A | N/A | 71 | Persists real user/assistant conversation records. | Medium | Send messages, reload/restart, and verify conversation history remains. |
| `shared/neuronest-warehouse/memoryService.js` | N/A | N/A | 59 | Persists unified user memory records. | High | Create/update/delete memories and verify user isolation and persistence. |
| `shared/neuronest-warehouse/activityService.js` | N/A | N/A | 46 | Records real activity events for analytics and Admin. | Medium | Login/create/chat and verify activity entries appear. |
| `shared/neuronest-warehouse/placeService.js` | N/A | N/A | 114 | Persists real saved places and place activity. | Medium | Save a place and verify it appears after restart and in Admin metrics. |

### Super Admin

| File | Added | Removed | Current lines | Purpose | Risk | How to test |
|---|---:|---:|---:|---|---|---|
| `neuronest-super-admin/server.js` | N/A | N/A | 1213 | Protects Admin APIs, polls Supabase, and serves real users/analytics/database records. | High | Login with allowed and denied emails; verify live PC records and protected APIs. |
| `neuronest-super-admin/public/index.html` | N/A | N/A | 2706 | Displays real Admin analytics, users, system health, and database explorer data. | Medium | Open Admin, inspect users/metrics/health, and confirm no demo records appear. |
| `neuronest-super-admin/.env.example` | N/A | N/A | 23 | Documents Admin auth, shared Supabase, and polling configuration. | Low | Compare against Admin Render environment settings. |

### Audit

| File | Added | Removed | Current lines | Purpose | Risk | How to test |
|---|---:|---:|---:|---|---|---|
| `NEURONEST_AI_CORE_V2_AUDIT.md` | N/A | N/A | 102 | Records completed production work, endpoints, configuration, verification, and limitations. | Low | Review against deployed API behavior and health output. |

## Other recently changed support files

These files were recently modified in the workspace but are supporting infrastructure rather than the AI Core V2 production pass.

| File | Added | Removed | Current lines | Purpose | Risk | How to test |
|---|---:|---:|---:|---|---|---|
| `shared/neuronest-warehouse/liveMonitorService.js` | N/A | N/A | 442 | Produces live monitoring and activity analytics. | Medium | Generate activity and confirm monitor summaries update. |
| `shared/neuronest-warehouse/moderationService.js` | N/A | N/A | 494 | Provides Admin moderation, status changes, audit actions, and data controls. | High | Test block/suspend/unblock with confirmation and verify audit records. |
| `shared/neuronest-warehouse/userService.js` | N/A | N/A | 48 | Persists and retrieves real user profiles. | High | Login as two users and confirm separate persisted profiles. |
| `shared/neuronest-warehouse/wsServer.js` | N/A | N/A | 74 | Broadcasts live warehouse/Admin events over WebSockets. | Medium | Connect Admin, create PC activity, and verify a live update event. |
| `neuronest-super-admin/package.json` | N/A | N/A | 13 | Defines Node runtime and Admin start scripts. | Low | Run `npm start` from the Admin directory. |
| `neuronest-super-admin/render.yaml` | N/A | N/A | 27 | Describes an Admin Render service deployment. | Medium | Validate settings against a staging Render service. |
| `neuronest-super-admin/README.md` | N/A | N/A | 23 | Documents Admin startup and configuration. | Low | Follow the documented local startup flow. |
| `neuronest-super-admin/.gitignore` | N/A | N/A | 3 | Prevents local secrets and generated data from entering Git. | High | Run `git status` after Git initialization and confirm `.env` stays absent. |
| `neuronest-super-admin/OPEN_ADMIN.bat` | N/A | N/A | 5 | Opens the local Admin interface on Windows. | Low | Run locally after starting Admin. |
| `neuronest-super-admin/START_BACKEND.bat` | N/A | N/A | 19 | Starts the local Admin backend on Windows. | Low | Run locally and verify `/api/health`. |
| `pc-ai-dashboard/.env` | N/A | N/A | 5 | Stores local-only PC secrets, including the configured OpenAI key. | Critical | Confirm it is ignored by Git; never display or upload it. |
| `neuronest-super-admin/.env` | N/A | N/A | 17 | Stores local-only Admin secrets and configuration. | Critical | Confirm it is ignored by Git; never display or upload it. |

## Local-only files

- `pc-ai-dashboard/.env` was updated with the local OpenAI key. It is ignored by Git and must never be uploaded.
- `neuronest-super-admin/.env` is local-only and must never be uploaded.
- Do not upload `node_modules/`, local `data/`, or local `uploads/`.

## Follow-up status

Completed:

- Real OpenAI chat, embeddings, semantic search, screenshot vision, and voice transcription.
- Unified persistent warehouse for memories, chats, media, timeline, intelligence, and usage.
- Supabase production mirror and pgvector schema.
- Evidence-backed Digital Twin, relationships, predictions, replay, insights, profiles, learning, and Life OS.
- Real Super Admin synchronization and analytics.
- Demo memories, hardcoded chat replies, fake goals, fake confidence floors, and silent fake embeddings removed.
- Backend syntax checks passed for PC services, shared warehouse services, and Super Admin.

Still required before production:

- Rotate the OpenAI key that was exposed in chat.
- Create/configure Supabase and run `pc-ai-dashboard/supabase_production_schema.sql`.
- Add production environment variables in Render.
- Configure Google OAuth origins and Maps website restrictions.
- Run authenticated end-to-end tests against the deployed services.
- Add automated API/integration tests.
- Initialize Git so future added/removed line counts are measurable.

## Render deployment

### GitHub contents

Push one repository containing at least:

```text
pc-ai-dashboard/
neuronest-super-admin/
shared/
NEURONEST_AI_CORE_V2_AUDIT.md
```

Both servers import `../shared/neuronest-warehouse`, so deploying only an individual dashboard folder will fail.

Do not push:

```text
**/.env
**/node_modules/
**/data/
**/uploads/
```

### Supabase setup

1. Create one Supabase project.
2. Open SQL Editor.
3. Run `pc-ai-dashboard/supabase_production_schema.sql`.
4. Copy the project URL and service-role key.
5. Use the same Supabase project for PC and Super Admin.

### PC Render web service

Create a Node Web Service connected to the GitHub repository:

```text
Root Directory: leave empty
Build Command: cd pc-ai-dashboard && npm install
Start Command: node pc-ai-dashboard/server.js
Health Check Path: /api/health
```

Leaving the root directory empty is required because the PC server imports
`shared/neuronest-warehouse` from outside `pc-ai-dashboard`.

Add:

```env
NODE_ENV=production
SESSION_SECRET=<long-random-secret>
GOOGLE_CLIENT_ID=<google-web-client-id>
GOOGLE_MAPS_API_KEY=<maps-browser-key>
OPENAI_API_KEY=<new-rotated-openai-key>
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ALLOW_LOCAL_AI_FALLBACK=false
SUPABASE_URL=<supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
SUPABASE_MEDIA_BUCKET=neuronest-media
NEURONEST_APP_URL=https://<pc-service>.onrender.com
RATE_LIMIT_PER_MINUTE=120
MAX_REQUEST_BODY_BYTES=25000000
```

Do not set `PORT`; Render supplies it.

### Super Admin Render web service

Create another Node Web Service from the same GitHub repository:

```text
Root Directory: leave empty
Build Command: cd neuronest-super-admin && npm install
Start Command: node neuronest-super-admin/server.js
Health Check Path: /api/health
```

Leaving the root directory empty is required because the Admin server imports
`shared/neuronest-warehouse` from outside `neuronest-super-admin`.

Add:

```env
NODE_ENV=production
GOOGLE_CLIENT_ID=<google-web-client-id>
SUPER_ADMIN_EMAILS=<approved-email-1>,<approved-email-2>
NEURONEST_APP_URL=https://<pc-service>.onrender.com
SUPABASE_URL=<same-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<same-supabase-service-role-key>
SUPABASE_MEDIA_BUCKET=neuronest-media
ADMIN_PRODUCTION_SYNC_MS=15000
ALLOW_ADMIN_DEV_LOGIN=false
```

`OPENAI_API_KEY` and `GOOGLE_MAPS_API_KEY` are optional in Admin and only affect its health indicators.

### Google configuration

Add both Render URLs to Google OAuth Authorized JavaScript origins:

```text
https://<pc-service>.onrender.com
https://<admin-service>.onrender.com
```

Add the PC URL to the Maps key website restrictions:

```text
https://<pc-service>.onrender.com/*
```

Allow `Maps JavaScript API` and `Places API (New)`.

### Production smoke test

1. Open `https://<pc-service>.onrender.com/api/health`.
2. Confirm OpenAI and Supabase report ready.
3. Login with Google.
4. Create a memory and ask AI Chat about it.
5. Run semantic memory search.
6. Upload a screenshot and record a voice note.
7. Confirm records exist in Supabase.
8. Open Super Admin with an approved email.
9. Confirm the user, memory, chat, screenshot, voice note, vector, and analytics counts appear.
10. Verify a non-approved email receives Access Denied.
