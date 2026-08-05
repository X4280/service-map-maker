// Password check for one of the three team logins. Each team has its own
// shared password (TEAM_PW_REDBULL / TEAM_PW_MERCEDES / TEAM_PW_FERRARI,
// Vercel env vars — not personal accounts). On success, returns a signed
// token (see _team-auth.js) the client stores and sends back on every
// clients-API call to prove which team it's acting as.
const { TEAMS, sign } = require("./_team-auth");

function pwEnvVar(team) { return "TEAM_PW_" + team.toUpperCase(); }

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const team = String(body.team || "").toLowerCase();
    if (TEAMS.indexOf(team) === -1) { res.status(400).json({ error: "Unknown team." }); return; }

    const pw = process.env[pwEnvVar(team)];
    if (!pw) { res.status(500).json({ error: "That team isn't configured yet." }); return; }
    if (body.password !== pw) { res.status(403).json({ error: "Wrong password." }); return; }

    let token;
    try { token = sign(team); }
    catch (e) { res.status(500).json({ error: "Not configured yet (missing TEAM_AUTH_SECRET)." }); return; }

    res.status(200).json({ token: token, team: team });
  } catch (e) {
    res.status(500).json({ error: e.message || "Something went wrong." });
  }
};
