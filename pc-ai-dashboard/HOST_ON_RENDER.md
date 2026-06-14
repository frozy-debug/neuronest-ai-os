# Host NeuroNest So Friends Can Login

Use Render to get a public HTTPS link like:

```text
https://neuronest-dashboard.onrender.com
```

Your friends can open that link and sign in with Google.

## Before You Start

You need:

- A GitHub account
- A Render account: `https://render.com`
- Your Google Client ID
- Your Google Maps API key, if you want Place Hunter and Map features online

Current Google Client ID:

```text
772163395287-gh77r0k0n7s7hpmjt3npju9pd17j34da.apps.googleusercontent.com
```

## 1. Upload This Project To GitHub

Create a new GitHub repo, for example:

```text
neuronest-dashboard
```

Upload the contents of this folder:

```text
pc-ai-dashboard
```

Make sure these files are in the GitHub repo:

```text
server.js
package.json
render.yaml
public/index.html
```

Do not upload `.env`. Keep real keys only in Render environment variables.

## 2. Deploy On Render

1. Open `https://dashboard.render.com`
2. Click **New**
3. Choose **Web Service**
4. Connect your GitHub repo
5. Use these settings:

```text
Name: neuronest-dashboard
Runtime: Node
Build Command: leave empty
Start Command: node server.js
```

6. Add environment variables:

```text
GOOGLE_CLIENT_ID=772163395287-gh77r0k0n7s7hpmjt3npju9pd17j34da.apps.googleusercontent.com
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
SESSION_SECRET=make-any-long-random-secret-here
NODE_ENV=production
OPENAI_API_KEY=your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
RATE_LIMIT_PER_MINUTE=120
```

OpenAI and Supabase keys are backend-only secrets. Add them in Render environment variables, never inside `public/index.html`.

If you want production vector search, create a Supabase project and run:

```text
supabase_memory_vectors.sql
```

in the Supabase SQL editor before deploying.

7. Click **Deploy Web Service**

After deploy, Render gives you a URL like:

```text
https://neuronest-dashboard.onrender.com
```

Copy your exact Render URL.

## 3. Add Render URL To Google Login

Go to:

```text
Google Cloud Console > Google Auth Platform > Clients > NeuroNest
```

Under **Authorized JavaScript origins**, add:

```text
https://your-render-url.onrender.com
```

Example:

```text
https://neuronest-dashboard.onrender.com
```

Do not add `/` at the end.

Save changes.

## 3B. Add Render URL To Google Maps API Key

Go to:

```text
Google Cloud Console > APIs & Services > Credentials > your Maps API key
```

Under **Application restrictions**, choose **Websites**, then add:

```text
https://your-render-url.onrender.com/*
```

Under **API restrictions**, allow:

```text
Maps JavaScript API
Places API (New)
```

Save changes, then redeploy or refresh the app.

## 4. Allow Anyone To Login

In Google Cloud:

```text
Google Auth Platform > Audience
```

If the app is in **Testing**, only test users can login.

To let your friends login:

1. Go to **Audience**
2. Look for publishing status
3. Click **Publish app** or move it to **Production**
4. Confirm

Because this app only uses basic Google sign in, you usually do not need sensitive-scope verification.

## 5. Share The Link

Send your friend the Render link:

```text
https://your-render-url.onrender.com
```

They can open it on phone or PC and sign in with Google.

## Notes

- Free Render services can sleep after inactivity. The first load may take some time.
- Without Supabase, chat history and uploads use the JSON warehouse and must be placed on a Render persistent disk.
- Separate PC and Super Admin Render services must use the same Supabase project. Run `supabase_production_schema.sql` and set the service-role key only in backend environment variables.
