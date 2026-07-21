// Shared client storage — one Redis hash ("sa_clients"), field = client name,
// value = JSON string of that client's saved settings (zips, colors, style, ...).
// No auth by design (internal tool, unlisted URL) — keep the guardrails below
// even so, since this endpoint is reachable by anyone with the link.
const { Redis } = require("@upstash/redis");

const HASH_KEY = "sa_clients";
const MAX_NAME_LEN = 120;
const MAX_PAYLOAD_BYTES = 1_500_000; // one client's JSON blob (logos ride along as data URLs)
const MAX_CLIENTS = 1000;             // total distinct clients stored

function redis() {
  // Redis.fromEnv() reads KV_REST_API_URL / KV_REST_API_TOKEN, which Vercel
  // injects automatically once an Upstash Redis integration is attached.
  return Redis.fromEnv();
}

module.exports = async (req, res) => {
  let db;
  try {
    db = redis();
  } catch (e) {
    res.status(500).json({ error: "Storage isn't configured yet (missing KV_REST_API_URL/TOKEN)." });
    return;
  }

  try {
    if (req.method === "GET") {
      const all = (await db.hgetall(HASH_KEY)) || {};
      const clients = {};
      for (const name of Object.keys(all)) {
        const v = all[name];
        // @upstash/redis may hand back an already-parsed object or a raw string
        // depending on how it was stored — accept either.
        clients[name] = typeof v === "string" ? JSON.parse(v) : v;
      }
      res.status(200).json({ clients });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const name = (body.name || "").trim();
      const data = body.data;

      if (!name) { res.status(400).json({ error: "Missing client name." }); return; }
      if (name.length > MAX_NAME_LEN) { res.status(400).json({ error: "Name is too long." }); return; }
      if (!data || typeof data !== "object") { res.status(400).json({ error: "Missing client data." }); return; }

      const json = JSON.stringify(data);
      if (json.length > MAX_PAYLOAD_BYTES) { res.status(413).json({ error: "That client's data is too large to save." }); return; }

      const existing = await db.hexists(HASH_KEY, name);
      if (!existing) {
        const count = await db.hlen(HASH_KEY);
        if (count >= MAX_CLIENTS) { res.status(507).json({ error: "Client list is full — delete some before adding more." }); return; }
      }

      await db.hset(HASH_KEY, { [name]: json });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const name = (req.query && req.query.name) ? String(req.query.name) : "";
      if (!name) { res.status(400).json({ error: "Missing client name." }); return; }
      await db.hdel(HASH_KEY, name);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : "Unexpected server error." });
  }
};
