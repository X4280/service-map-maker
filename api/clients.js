// Shared client storage — one Redis hash ("sa_clients"), field = client name,
// value = JSON string of that client's saved settings (zips, colors, style,
// ...) plus a "team" tag (redbull/mercedes/ferrari) that says who owns it.
//
// Team-scoped, but not password-protected — this is a lightweight org filter,
// not an access-control boundary (anyone can pick any team). GET only returns
// clients tagged with the requested team; no team, no clients. POST requires
// a team and stamps the saved client with it; it refuses to overwrite a
// client that already belongs to a different team. DELETE likewise requires
// the deleting request's team to match the client's team.
const { Redis } = require("@upstash/redis");

const HASH_KEY = "sa_clients";
const MAX_NAME_LEN = 120;
const MAX_PAYLOAD_BYTES = 1_500_000; // one client's JSON blob (logos ride along as data URLs)
const MAX_CLIENTS = 1000;             // total distinct clients stored
const TEAMS = ["redbull", "mercedes", "ferrari"];

function validTeam(t) { return TEAMS.indexOf(t) > -1 ? t : null; }

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
      const team = validTeam(req.query && req.query.team);
      const all = (await db.hgetall(HASH_KEY)) || {};
      const clients = {};
      if (team) {
        for (const name of Object.keys(all)) {
          const v = all[name];
          // @upstash/redis may hand back an already-parsed object or a raw string
          // depending on how it was stored — accept either.
          const parsed = typeof v === "string" ? JSON.parse(v) : v;
          if (parsed && parsed.team === team) clients[name] = parsed;
        }
      }
      res.status(200).json({ clients });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const team = validTeam(body.team);
      if (!team) { res.status(400).json({ error: "Select a team to save clients." }); return; }

      const name = (body.name || "").trim();
      const data = body.data;

      if (!name) { res.status(400).json({ error: "Missing client name." }); return; }
      if (name.length > MAX_NAME_LEN) { res.status(400).json({ error: "Name is too long." }); return; }
      if (!data || typeof data !== "object") { res.status(400).json({ error: "Missing client data." }); return; }

      const existingRaw = await db.hget(HASH_KEY, name);
      if (existingRaw) {
        const existing = typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw;
        if (existing && existing.team && existing.team !== team) {
          res.status(409).json({ error: "That name belongs to another team already." });
          return;
        }
      } else {
        const count = await db.hlen(HASH_KEY);
        if (count >= MAX_CLIENTS) { res.status(507).json({ error: "Client list is full — delete some before adding more." }); return; }
      }

      data.team = team;
      const json = JSON.stringify(data);
      if (json.length > MAX_PAYLOAD_BYTES) { res.status(413).json({ error: "That client's data is too large to save." }); return; }

      await db.hset(HASH_KEY, { [name]: json });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const name = (req.query && req.query.name) ? String(req.query.name) : "";
      const team = validTeam(req.query && req.query.team);
      if (!name) { res.status(400).json({ error: "Missing client name." }); return; }
      if (!team) { res.status(400).json({ error: "Select a team to delete clients." }); return; }

      const existingRaw = await db.hget(HASH_KEY, name);
      if (existingRaw) {
        const existing = typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw;
        if (existing && existing.team && existing.team !== team) {
          res.status(403).json({ error: "That client belongs to another team." });
          return;
        }
      }

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
