const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const { sendOtpEmail } = require("../utils/mailer"); // Postmark mailer

// SEND OTP
router.post("/send", async (req, res) => {
  const { userId, email } = req.body;

  if (!userId || !email) {
    return res.status(400).json({ error: "Missing userId or email" });
  }

  try {
    // ✅ Generate OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // ✅ Store OTP in DB (delete old OTPs first)
    await prisma.$transaction([
      prisma.emailOtp.deleteMany({ where: { userId } }),
      prisma.emailOtp.create({
        data: { userId, code, expiresAt }
      })
    ]);

    // ✅ Send OTP via email
    await sendOtpEmail(email, code);

    console.log(`🔐 OTP GENERATED & SENT: ${code} for USER: ${userId}`);

    return res.json({
      success: true,
      message: "OTP sent successfully"
    });
  } catch (err) {
    console.error("❌ OTP SEND ERROR:", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

// VERIFY OTP
router.post("/verify", async (req, res) => {
  const { userId, code } = req.body;

  if (!userId || !code) {
    return res.status(400).json({ error: "Missing userId or code" });
  }

  try {
    const otp = await prisma.emailOtp.findFirst({
      where: { userId, code, expiresAt: { gt: new Date() } }
    });

    if (!otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // ✅ Mark user as verified & delete OTPs
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true }
      }),
      prisma.emailOtp.deleteMany({ where: { userId } })
    ]);

    console.log(`✅ OTP VERIFIED for USER: ${userId}`);

    return res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("❌ OTP VERIFY ERROR:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;
