# NeuroNest Mobile AI

Mobile-only NeuroNest AI Memory OS.

## Run locally

```text
npm start
```

Open:

```text
http://localhost:3000
```

## Required environment variables

```text
GOOGLE_CLIENT_ID
GOOGLE_MAPS_API_KEY
SESSION_SECRET
NODE_ENV=production
```

`GOOGLE_CLIENT_SECRET` is optional for this app because the login flow uses Google ID tokens.
Do not place client secrets in HTML, JavaScript, or GitHub.
