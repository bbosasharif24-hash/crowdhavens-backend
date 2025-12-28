// =====================================================
// 🔥 Postmark Mailer (Production Safe)
// =====================================================
const postmark = require("postmark");

console.log("📧 Initializing Postmark mailer...");

const { POSTMARK_API_KEY, FROM_EMAIL } = process.env;

if (!POSTMARK_API_KEY || !FROM_EMAIL) {
  console.error("❌ Missing POSTMARK_API_KEY or FROM_EMAIL");
  // ❗ Do not crash the server on Render
}

const client = POSTMARK_API_KEY
  ? new postmark.ServerClient(POSTMARK_API_KEY)
  : null;

/**
 * Send OTP Email
 */
async function sendEmail({ to, subject, html }) {
  if (!client) {
    console.error("❌ Postmark client not initialized");
    return;
  }

  try {
    await client.sendEmail({
      From: FROM_EMAIL,
      To: to,
      Subject: subject,
      HtmlBody: html,
      MessageStream: "outbound",
    });

    console.log(`✅ OTP email sent to ${to}`);
  } catch (err) {
    console.error("❌ Failed to send OTP email:", err);
    throw err; // let route handle failure
  }
}

module.exports = sendEmail;
