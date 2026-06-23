# NeuroNest Mobile OS

Premium mobile web version of NeuroNest with PC feature parity.

This is a separate deployable app, but it does not create separate fake data.
Set `NEURONEST_API_BASE_URL` to the deployed PC NeuroNest backend so mobile,
desktop, Supabase/warehouse, and Super Admin all use the same real records.

## Local Run

```text
npm start
```

Open:

```text
http://localhost:3002
```

For local shared-data testing, start the PC app on `http://localhost:3000` and set:

```text
NEURONEST_API_BASE_URL=http://127.0.0.1:3000
```

## Main Screens

- Home Dashboard
- AI Chat
- Memory Hub
- Life Replay
- Life OS command center
- Digital Twin
- Relationship Intelligence
- Future Intelligence
- AI Chief of Staff
- Memory Atlas
- Memory Time Machine
- Decision Intelligence
- Opportunity Engine
- Future Self Simulator
- Autonomous Capture
- Settings & Privacy

## Production Environment

```text
NODE_ENV=production
SESSION_SECRET=long-random-secret
NEURONEST_API_BASE_URL=https://your-main-neuronest-app.onrender.com
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

Do not commit `.env`, service role keys, OpenAI keys, Groq keys, Supabase keys, or Google secrets.
Those belong only in Render environment variables on the PC backend or mobile service.
