// Internal-only "Team Red Bull" reveal.
// This repo is PUBLIC on GitHub, so the actual image is never committed —
// it lives in Redis (private infra, already connected via the Upstash
// integration) and is only handed back after a password check against
// TEAM_REDBULL_PASSWORD (a Vercel env var, not in git).
//
// PUT  { password, data }  — one-time (or repeat) admin upload of a data URL.
// POST { password }        — reveal: returns the stored data URL.
const { Redis } = require("@upstash/redis");

const KEY = "team_redbull_gif";
const MAX_LEN = 2_000_000; // base64 data-URL string cap — generous for a small gif

function redis() { return Redis.fromEnv(); }

module.exports = async (req, res) => {
  const pw = process.env.TEAM_REDBULL_PASSWORD;
  if (!pw) { res.status(500).json({ error: "Not configured yet (missing TEAM_REDBULL_PASSWORD)." }); return; }

  let db;
  try { db = redis(); } catch (e) { res.status(500).json({ error: "Storage isn't configured yet." }); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (body.password !== pw) { res.status(403).json({ error: "Wrong password." }); return; }

    if (req.method === "PUT") {
      const data = String(body.data || "");
      if (data.indexOf("data:image/") !== 0 || data.length > MAX_LEN) {
        res.status(400).json({ error: "Bad or oversized image data." });
        return;
      }
      await db.set(KEY, data);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "POST") {
      const data = await db.get(KEY);
      if (!data) { res.status(404).json({ error: "Nothing uploaded yet." }); return; }
      res.status(200).json({ image: data });
      return;
    }

    res.setHeader("Allow", "POST, PUT");
    res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    res.status(500).json({ error: e.message || "Something went wrong." });
  }
};
