const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// SEND OTP
router.post("/send", async (req, res) => {
  const { userId, email } = req.body;

  console.log("📥 OTP SEND REQUEST:", req.body);

  if (!userId || !email) {
    return res.status(400).json({ error: "Missing userId or email" });
  }

  try {
    // ✅ Ensure Prisma is connected
    await prisma.$connect();

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // ✅ Transaction = SAFE on Windows
    await prisma.$transaction([
      prisma.emailOtp.deleteMany({
        where: { userId }
      }),
      prisma.emailOtp.create({
        data: {
          userId,
          code,
          expiresAt
        }
      })
    ]);

    console.log("🔐 OTP GENERATED:", code, "FOR USER:", userId);

    return res.json({
      success: true,
      message: "OTP generated (dev mode)"
    });

  } catch (err) {
    console.error("❌ OTP SEND ERROR:", err);

    return res.status(500).json({
      error: "OTP generation failed. Try again."
    });
  }
});

// VERIFY OTP
router.post("/verify", async (req, res) => {
  const { userId, code } = req.body;

  console.log("📥 OTP VERIFY REQUEST:", req.body);

  if (!userId || !code) {
    return res.status(400).json({ error: "Missing userId or code" });
  }

  try {
    await prisma.$connect();

    const otp = await prisma.emailOtp.findFirst({
      where: {
        userId,
        code,
        expiresAt: { gt: new Date() }
      }
    });

    if (!otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true }
      }),
      prisma.emailOtp.deleteMany({
        where: { userId }
      })
    ]);

    console.log("✅ OTP VERIFIED FOR USER:", userId);

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ OTP VERIFY ERROR:", err);

    return res.status(500).json({
      error: "Verification failed"
    });
  }
});

module.exports = router;
