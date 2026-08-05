// Shared HMAC-signed team-session helper for the team-scoped saved-clients
// feature. Not a route — Vercel skips any file whose name starts with "_",
// so this is only ever required() by api/clients.js and api/team-login.js.
const crypto = require("crypto");

const TEAMS = ["redbull", "mercedes", "ferrari"];
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 180; // ~6 months

function secret() {
  const s = process.env.TEAM_AUTH_SECRET;
  if (!s) throw new Error("Missing TEAM_AUTH_SECRET");
  return s;
}

function sign(team) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const mac = crypto.createHmac("sha256", secret()).update(team + "." + exp).digest("hex");
  return team + "." + exp + "." + mac;
}

// Returns the verified team name, or null if the token is missing/malformed/
// expired/forged.
function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [team, expStr, mac] = parts;
  if (TEAMS.indexOf(team) === -1) return null;
  const exp = Number(expStr);
  if (!exp || Date.now() > exp) return null;

  let expected;
  try { expected = crypto.createHmac("sha256", secret()).update(team + "." + expStr).digest("hex"); }
  catch (e) { return null; }

  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return team;
}

module.exports = { TEAMS, sign, verify };
