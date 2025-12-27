// =====================================================
// 🔥 Postmark Mailer for OTP & Transactional Emails
// =====================================================
const postmark = require("postmark");

console.log("📧 Initializing Postmark email client...");

// Validate environment variables
const { POSTMARK_API_KEY, FROM_EMAIL } = process.env;

if (!POSTMARK_API_KEY || !FROM_EMAIL) {
  console.error(
    "❌ Missing Postmark environment variables. Check .env or Render secrets."
  );
  process.exit(1); // stop server if critical env is missing
}

// Create Postmark client
const client = new postmark.ServerClient(POSTMARK_API_KEY);

// Test connection by sending a dummy verification email (optional)
async function verifyClient() {
  try {
    await client.sendEmail({
      From: FROM_EMAIL,
      To: FROM_EMAIL,
      Subject: "Postmark Client Verification",
      TextBody: "✅ Postmark client initialized successfully",
    });
    console.log("✅ Postmark client verified successfully");
  } catch (err) {
    console.error("❌ Postmark verification failed:", err);
  }
}

verifyClient();

// Function to send OTP email
async function sendOtpEmail(to, code) {
  try {
    await client.sendEmail({
      From: FROM_EMAIL,
      To: to,
      Subject: "Your CrowdHavens OTP Code",
      TextBody: `Your OTP code is: ${code}`,
    });
    console.log(`✅ OTP sent to ${to}`);
  } catch (err) {
    console.error("❌ Failed to send OTP:", err);
  }
}

module.exports = { sendOtpEmail };
