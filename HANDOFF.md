# Handoff — Service Area Mapper

Single-page app (`index.html`, ~5k lines, vanilla JS, no build step) that turns zip
codes / states / a radius / a hand-drawn shape into a styled service-area map, exports
4K stills and constant-frame-rate MP4 video for ads, with a tiny Vercel + Upstash Redis
backend for shared saved clients and usage tracking.

**Live:** https://service-map-maker.vercel.app
**Repo:** https://github.com/X4280/service-map-maker (main, pushed through `f3f7148`)

## Architecture
- `index.html` — the entire frontend. One big IIFE at the bottom (`<script>...</script>`).
  No framework, no bundler. Edit in place with a text editor / Edit tool.
- `api/clients.js` — Vercel serverless fn. GET/POST/DELETE on saved clients, stored as
  one Redis hash (`sa_clients`, field = client name, value = JSON blob of that client's
  full settings). No auth — anyone with the URL can read/write. Uses `@upstash/redis`
  via `Redis.fromEnv()` (reads `KV_REST_API_URL`/`KV_REST_API_TOKEN`, auto-injected by
  Vercel's Upstash Marketplace integration — already connected).
- `api/usage.js` — same pattern, tracks Mapbox geocoding/tile usage per-token (hashed,
  never the raw token) so the in-app usage meter can show cross-device totals.
- No database migrations, no build step. `git push` to `main` auto-deploys via Vercel.

## Deploy
```bash
git add -A && git commit -m "..." && git push origin main
```
`gh` CLI is authed on this machine as `X4280` — pushes work directly, no token needed.
Vercel deploy is automatic on push, usually live within ~1-2 min. **The very first
load after a deploy can be stale from Vercel's edge cache** — hard refresh if something
looks off right after pushing.

## Key architectural decisions (don't relitigate these)
- **Mapbox Standard style is flaky.** Its fragment-based loader can report
  `isStyleLoaded()==false` even after settling, and can wipe custom sources mid-session
  ("Unable to perform style diff: rebuilding from scratch" in console). Two defenses
  already in place: `whenStyleReady()` polls with a hard timeout instead of trusting a
  single `idle` event, and `setFillSweep()` self-heals by rebuilding the gradient layer
  if its source ever goes missing. If you add MORE custom sources/layers, make sure
  they're re-added on `map.on("style.load", ...)` (search for that exact line) or add a
  similar self-heal.
- **4K export is a deterministic frame-by-frame loop**, not real-time capture — see
  `encodeWebCodecs()`. It advances the camera, waits for tiles (`renderSettled()`), then
  encodes each frame via WebCodecs `VideoEncoder` + `mp4-muxer`. This is why exports are
  slow but frame-perfect. There's a `MediaRecorder`-based real-time fallback
  (`encodeMediaRecorder`) for browsers without WebCodecs.
- **Outline vs fill are separate Mapbox sources.** `area-src` (polygon, for fill) and
  `outline-src` (LineString, derived via `outlineFC()`, for the visible line/glow/
  casing/stroke-draw-on-animation). If you touch shape-editing code, **both** must be
  kept in sync — this exact desync was a shipped bug, fixed in commit `f2dfb56`
  (`refreshEdit()` now updates both).
- **Client-save payload includes the fully-built shape** (`savedArea`/`savedParts`) so
  reloading a saved client costs zero geocoding — see `reuseArea`/`reuseSig` and the
  shortcut at the top of the `$("draw")` click handler.
- **Testing constraint you'll hit immediately:** the sandboxed Browser pane tab is
  `document.hidden=true` unless you explicitly call `tabs_select` on it (and again after
  every `navigate()` — it doesn't stick). This suspends `requestAnimationFrame`
  entirely, stalling Mapbox's internal render loop and anything gated on it
  (`flyTo`/`moveend`, live preview ticks). Not a code bug — always re-select the tab
  before testing anything animation-related, or test via direct function calls /
  pixel-sampling instead of trusting on-screen animation to complete.

## Recent session's work (last ~10 commits)
- Creative Pro Pack: title cards (6 presets, positioning/fonts/bg), dashed/dotted
  outlines + casing, batch PNG export (all 3 aspect ratios), transparent PNG, SVG/
  GeoJSON export, client duplicate/share-link, keyboard shortcuts.
- Live shape rebuild (switch convex/concave/pad/tightness with zero re-geocoding),
  sturdier edit-handle hit targets, gradient/spotlight fill (baked-canvas, clipped to
  polygon), animated spotlight sweep (Gaussian sampled onto fixed stops so it can move
  smoothly), cinematic vignette.
- Free draw mode (new "Draw" area-source tab — click map to place points, no
  geocoding), fixed the edit-mode line/fill desync bug described above, strengthened
  edit-time smoothing (2→3 Chaikin iterations), per-marker visibility toggle.
- Selecting "— new / unsaved —" in Saved Clients now actually clears the map and
  re-arms Draw mode (was previously a no-op).

## Known gaps / things not yet done
- No tests beyond manual + headless Node verification during each session (see git log
  commit messages — they document what was actually verified, not just what was built).
- Double-click-to-finish in free-draw adds a near-duplicate point (Mapbox fires two
  `click` events before `dblclick`) — cosmetically harmless (invisible after smoothing)
  but not deduplicated.
- No login/auth on the client list or usage tracking — anyone with the URL can read/
  write. Intentional per earlier decision, revisit if this becomes a problem.
- `document.hidden` testing quirk above will bite the next session too — read it before
  spending time chasing a "broken" animation that's actually just an unfocused tab.

## Quick orientation for a fresh session
1. Read this file, then skim `README.md` for the deploy walkthrough.
2. `grep -n "function "  index.html | wc -l` — it's a big flat file; use `grep -n` to
   jump to named functions rather than reading linearly.
3. To test locally: spin up a tiny Node http server that mounts `api/clients.js` and
   `api/usage.js` behind a fake in-memory Redis (pattern used repeatedly this session —
   search recent commits' PR-style descriptions for the exact snippet), then use the
   Browser pane tools. Remember to `tabs_select` after every navigate.
4. Don't add new libraries/build steps without a strong reason — the whole point of this
   app is "paste this one file, it just works."
