// In-app bug report / feature request — emails the owner via Resend.
// No auth (matches clients.js/usage.js) — rate-limited only by Resend's own
// account limits. Needs RESEND_API_KEY set as a Vercel env var; without it
// this responds 500 so the UI can say "not configured yet" instead of
// silently swallowing submissions.
const { Resend } = require("resend");

const TO_EMAIL = "bjauke@punchypm.com";
const FROM_EMAIL = "Service Area Mapper <onboarding@resend.dev>";
const MAX_MSG_LEN = 5000;
const MAX_CONTACT_LEN = 200;
const TYPES = { bug: "Bug report", feature: "Feature request", other: "Ticket" };

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Email isn't configured yet (missing RESEND_API_KEY)." }); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const type = TYPES[body.type] ? body.type : "other";
    const message = String(body.message || "").trim();
    const contact = String(body.contact || "").trim().slice(0, MAX_CONTACT_LEN);

    if (!message) { res.status(400).json({ error: "Add a description before sending." }); return; }
    if (message.length > MAX_MSG_LEN) { res.status(400).json({ error: "That's too long — trim it down a bit." }); return; }

    const resend = new Resend(apiKey);
    const subject = "[Service Area Mapper] " + TYPES[type];
    const text = "Type: " + TYPES[type] + "\n" +
                 (contact ? ("From: " + contact + "\n") : "") +
                 "\n" + message;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: contact || undefined,
      subject: subject,
      text: text
    });

    if (error) { res.status(502).json({ error: error.message || "Resend rejected the email." }); return; }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Something went wrong." });
  }
};
