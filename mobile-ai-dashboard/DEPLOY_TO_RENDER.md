# Deploy NeuroNest Mobile On Render

Use this folder only:

```text
mobile-ai-dashboard
```

Do not upload `.env`, `data/db.json`, `server.log`, `server.err`, or `node_modules`.

## 1. Push To GitHub

1. Create a GitHub repo, for example `neuronest-mobile-ai`.
2. Upload the contents of `mobile-ai-dashboard`.
3. Confirm these files are in the GitHub repo:

```text
server.js
package.json
render.yaml
public/index.html
public/assets/neuronest-logo.png
```

## 2. Create Render Web Service

1. Open Render Dashboard.
2. New > Web Service.
3. Connect the GitHub repo.
4. Use:

```text
Runtime: Node
Build Command: leave empty
Start Command: node server.js
```

If you uploaded the full parent project, set Render Root Directory to:

```text
mobile-ai-dashboard
```

If you uploaded only this folder's contents, leave Root Directory empty.

## 3. Add Render Environment Variables

Add these in Render > Environment:

```text
NODE_ENV=production
SESSION_SECRET=make-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

The current app uses Google ID-token login, so `GOOGLE_CLIENT_SECRET` is stored only for future OAuth code-flow support. Never put it in HTML or public JavaScript.

## 4. Configure Google Login

After Render gives you a URL like:

```text
https://neuronest-mobile-ai.onrender.com
```

Go to:

```text
Google Cloud Console > Google Auth Platform > Clients > your Web client
```

Add this under Authorized JavaScript origins:

```text
https://neuronest-mobile-ai.onrender.com
```

Do not add a trailing `/`.

If the app is still in Testing, add your friend's Gmail as a test user or publish the app.

## 5. Configure Google Maps Key

Go to:

```text
Google Cloud Console > APIs & Services > Credentials > your Maps API key
```

Application restrictions:

```text
Websites
```

Allowed website:

```text
https://neuronest-mobile-ai.onrender.com/*
```

API restrictions:

```text
Maps JavaScript API
Places API
Places API (New)
```

Save, then redeploy or refresh the Render site.

## 6. Share

Send your friend the Render URL:

```text
https://neuronest-mobile-ai.onrender.com
```

Free Render services can sleep after inactivity, so the first load can take a little time.
