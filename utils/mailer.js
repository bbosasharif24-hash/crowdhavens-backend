// =====================================================
// 🔥 Postmark Mailer (Production Safe)
// =====================================================
const postmark = require("postmark");

console.log("📧 Initializing Postmark mailer...");

const { POSTMARK_API_KEY, FROM_EMAIL } = process.env;

if (!POSTMARK_API_KEY || !FROM_EMAIL) {
  console.error("❌ Missing POSTMARK_API_KEY or FROM_EMAIL");
  // ❗ DO NOT crash the server on Render
}

const client = POSTMARK_API_KEY
  ? new postmark.ServerClient(POSTMARK_API_KEY)
  : null;

/**
 * Send OTP Email
 */
async function sendOtpEmail(to, code) {
  if (!client) {
    console.error("❌ Postmark client not initialized");
    return;
  }

  try {
    await client.sendEmail({
      From: FROM_EMAIL,
      To: to,
      Subject: "Your CrowdHavens Verification Code",
      HtmlBody: `
        <h2>CrowdHavens Email Verification</h2>
        <p>Your OTP code is:</p>
        <h1 style="letter-spacing:3px">${code}</h1>
        <p>This code expires in 10 minutes.</p>
      `,
      MessageStream: "outbound",
    });

    console.log(`✅ OTP email sent to ${to}`);
  } catch (err) {
    console.error("❌ Failed to send OTP email:", err);
    throw err; // let route handle failure
  }
}

module.exports = { sendOtpEmail };
