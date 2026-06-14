# NeuroNest Super Admin Control Center

Standalone Super Admin application for monitoring and managing the NeuroNest ecosystem.

## Local

**Windows (easiest):** double-click `START_BACKEND.bat`, then `OPEN_ADMIN.bat`.

```bash
cd neuronest-super-admin
npm install
npm start
```

Open `http://localhost:3100`.

For local testing without Google sign-in, set `ALLOW_ADMIN_DEV_LOGIN=true` in `.env` and sign in with an email listed in `SUPER_ADMIN_EMAILS`.

## Required Render Environment Variables

- `GOOGLE_CLIENT_ID`
- `SUPER_ADMIN_EMAILS`
- `NEURONEST_APP_URL`
- `NEURONEST_DB_PATH`

Optional health indicators:

- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Data Source

By default the app reads `../pc-ai-dashboard/data/db.json`, so it can share the local NeuroNest data file in this monorepo. For production-grade live sync across separate Render services, move NeuroNest data into a shared external database such as Supabase/Postgres, then point both the dashboard and admin service at the same database.
