# Service Map Maker

Zip / state / radius service-area map generator — 4K PNG + MP4 ad exports, editable outlines, and server-saved clients.

## Local files

- `index.html` — the whole app (static, no build step).
- `api/clients.js` — Vercel serverless function backing the "Saved clients" list (GET/POST/DELETE), storing each client as one field in a Redis hash.
- `api/usage.js` — usage roll-up (GET/POST). The browser reports the Mapbox requests it makes (geocoding + tiles), keyed by a **hash** of the token, so the counter aggregates across every device/teammate on the same token. The raw token never reaches the server. This reflects usage the tool generates — the authoritative bill is still your Mapbox dashboard.
- No login. Both the client list and usage totals are shared by anyone with the deployed URL — keep the URL unlisted if that matters to you.
- The Mapbox token is entered in the browser and stored per-browser (`localStorage`), not on the server.
- Both functions use the same Upstash Redis integration (the `KV_REST_API_*` env vars) — no extra setup beyond the one storage step below.

## Deploy (GitHub → Vercel, one-time setup)

### 1. Push to GitHub
```bash
git remote add origin https://github.com/<you>/service-map-maker.git
git branch -M main
git push -u origin main
```
(Create the empty repo first at github.com/new — don't initialize it with a README, or the push will conflict.)

### 2. Import into Vercel
- vercel.com → **Add New… → Project** → import the GitHub repo you just pushed.
- Framework preset: **Other** (it's auto-detected — no build command needed).
- Deploy. It'll go live even before the database step below; drawing/exporting maps works immediately, saved clients will just show a "can't reach server" message until step 3.

### 3. Add the database (Upstash Redis)
- In the Vercel project → **Storage** tab → **Marketplace Database Providers** → **Upstash** → create a Redis database → connect it to this project.
- This auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables — nothing to copy/paste by hand.
- Redeploy the project (Vercel prompts you to, since the new env vars only apply to future deployments — Deployments tab → ⋯ on the latest one → **Redeploy**).

### 4. Use it
Open the deployed URL, paste your Mapbox public token (`pk.…`), and go. Saved clients now persist on the server — anyone with the link sees the same list.

## Local development
It's a static file plus one serverless function, so there's no dev server required for the map itself — opening `index.html` directly works for everything except Saved Clients (that needs `/api/clients`, which only exists once deployed, or via `vercel dev` if you install the Vercel CLI locally).
