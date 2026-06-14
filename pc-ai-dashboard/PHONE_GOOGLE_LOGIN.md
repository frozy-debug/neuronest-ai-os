# Phone Google Login

Google will not accept this kind of phone Wi-Fi URL:

```text
http://192.168.1.5:3000
```

For phone Google login, you need a public HTTPS URL. The easiest tool is ngrok.

## 1. Install ngrok

Download:

```text
https://ngrok.com/download
```

Create a free ngrok account, then copy your authtoken.

Run this once in Command Prompt:

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

## 2. Start The Phone Version

Double-click:

```text
START_PHONE_GOOGLE_LOGIN.bat
```

It starts:

- your NeuroNest backend on `http://localhost:3000`
- ngrok tunnel to that backend
- ngrok dashboard at `http://127.0.0.1:4040`

## 3. Copy The HTTPS URL

In the ngrok dashboard, copy the **Forwarding** URL that starts with:

```text
https://
```

Example:

```text
https://abc123.ngrok-free.app
```

## 4. Add It To Google Cloud

Go to:

```text
Google Cloud Console > Google Auth Platform > Clients > NeuroNest
```

Under **Authorized JavaScript origins**, add the ngrok URL:

```text
https://abc123.ngrok-free.app
```

Do not add a slash at the end.

Save changes.

## 5. Open On Phone

Open the same ngrok URL on your phone:

```text
https://abc123.ngrok-free.app
```

Now Google login should work on phone.

## Important

Free ngrok URLs can change every time you restart ngrok. If the URL changes, update Google Cloud again.

For a permanent phone login URL, use a static ngrok domain or deploy the app online.
