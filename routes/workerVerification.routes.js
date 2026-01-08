const express = require("express");
const router = express.Router();
const auth = require("../middleware/authDashboard");
const { prisma } = require("../prismaClient");
const { createAirTMPayment } = require("../utils/airtm");

// Start $1 AirTM verification
router.post("/airtm", auth, async (req, res) => {
  try {
    const paymentUrl = await createAirTMPayment(req.userId, 1);
    await prisma.verification.create({
      data: { userId: req.userId, status: "pending", paymentId: "tempId" },
    });
    res.json({ paymentUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start verification" });
  }
});

// AirTM callback webhook
router.post("/airtm/callback", async (req, res) => {
  const { userId, status } = req.body;
  if (status === "success") {
    await prisma.user.update({ where: { id: userId }, data: { verified: true } });
    await prisma.verification.updateMany({
      where: { userId },
      data: { status: "completed" },
    });
  }
  res.sendStatus(200);
});

module.exports = router;
