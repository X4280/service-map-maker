// Per-token usage roll-up, shared across every device/teammate using the tool.
// The browser reports the Mapbox requests it makes (geocoding + map tiles),
// keyed by a HASH of the token — the raw token never reaches this server.
// This counts what THE TOOL generates; it is not Mapbox's authoritative bill
// and can't see usage from other apps on the same token.
const { Redis } = require("@upstash/redis");

const FIELDS = ["geocode", "tiles", "style", "other"];
const MAX_INC = 200000;                 // sane per-request cap
const KEY_TTL = 60 * 60 * 24 * 400;     // ~13 months
const HASH_RE = /^[a-f0-9]{8,64}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function redis(){ return Redis.fromEnv(); }
function keyFor(h, m){ return "use:" + h + ":" + m; }

module.exports = async (req, res) => {
  let db;
  try { db = redis(); }
  catch (e) { res.status(500).json({ error: "Storage isn't configured yet." }); return; }

  try {
    if (req.method === "GET") {
      const h = String((req.query && req.query.h) || "");
      const m = String((req.query && req.query.m) || "");
      if (!HASH_RE.test(h) || !MONTH_RE.test(m)) { res.status(400).json({ error: "Bad token hash or month." }); return; }
      const raw = (await db.hgetall(keyFor(h, m))) || {};
      const totals = {};
      FIELDS.forEach(function(f){ totals[f] = Number(raw[f] || 0) || 0; });
      res.status(200).json({ totals: totals });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const h = String(body.h || "");
      const m = String(body.m || "");
      const inc = body.inc || {};
      if (!HASH_RE.test(h) || !MONTH_RE.test(m)) { res.status(400).json({ error: "Bad token hash or month." }); return; }

      const key = keyFor(h, m);
      let touched = false;
      for (const f of FIELDS) {
        let v = Math.floor(Number(inc[f]) || 0);
        if (v <= 0) continue;
        if (v > MAX_INC) v = MAX_INC;
        await db.hincrby(key, f, v);
        touched = true;
      }
      if (touched) { try { await db.expire(key, KEY_TTL); } catch (e) {} }
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : "Unexpected server error." });
  }
};
