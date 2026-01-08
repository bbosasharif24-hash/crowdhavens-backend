const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// Middleware to check if user is ADMIN
const checkAdmin = async (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access only" });
  }

  req.user = user; // Attach user info
  next();
};

// Middleware to check if user is WORKER (for sending request)
const checkWorker = async (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "WORKER") {
    return res.status(403).json({ error: "Worker access only" });
  }

  req.userId = userId;
  next();
};

// ✅ WORKER SUBMITS VERIFICATION ($1)
router.post("/request", checkWorker, async (req, res) => {
  try {
    const { method, txId, name, email } = req.body;

    // 1. Create Verification Request
    const newRequest = await prisma.verificationRequest.create({
      data: {
        userId: req.userId,
        method,
        txId,
        name, // Name from dashboard
        email, // Email from dashboard
        amount: 1.00,
        status: "PENDING"
      }
    });

    // 2. (Optional) Update User Status to PENDING immediately
    // await prisma.user.update({
    //   where: { id: req.userId },
    //   data: { verificationStatus: "PENDING" } // Assuming you have this enum
    // });

    res.json({ message: "Verification request submitted", request: newRequest });

  } catch (error) {
    console.error("Verification request error:", error);
    res.status(500).json({ error: "Failed to submit verification" });
  }
});

// ✅ ADMIN GETS ALL PENDING VERIFICATIONS
router.get("/admin/pending", checkAdmin, async (req, res) => {
  try {
    const pending = await prisma.verificationRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" }
    });
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// ✅ ADMIN APPROVES VERIFICATION
router.post("/admin/approve", checkAdmin, async (req, res) => {
  try {
    const { requestId, approve } = req.body; // approve: true/false

    const verification = await prisma.verificationRequest.findUnique({
      where: { id: requestId }
    });

    if (!verification) return res.status(404).json({ error: "Request not found" });

    // Update Verification Status
    const newStatus = approve ? "APPROVED" : "REJECTED";
    await prisma.verificationRequest.update({
      where: { id: requestId },
      data: { status: newStatus }
    });

    if (approve) {
      // 1. Verify the User
      await prisma.user.update({
        where: { id: verification.userId },
        data: { verificationStatus: "VERIFIED" }
      });

      // 2. Check for Referral Bonus
      if (!verification.referralTriggered) {
        const user = await prisma.user.findUnique({ where: { id: verification.userId } });
        
        if (user.referredBy) {
          // Find Referrer
          // Assuming stored as email string. If it's ID, change to findUnique.
          // For now, let's assume email matching since that's how frontend tracks it often.
          const referrer = await prisma.user.findFirst({ 
             where: { email: user.referredBy } 
          });

          if (referrer) {
            await prisma.referralPayout.create({
              data: {
                referrerEmail: referrer.email,
                newUserEmail: user.email,
                amount: 0.50,
                status: "LOGGED"
              }
            });

            // Mark as triggered so we don't pay twice
            await prisma.verificationRequest.update({
              where: { id: requestId },
              data: { referralTriggered: true }
            });
          }
        }
      }
    }

    res.json({ message: `Verification ${newStatus.toLowerCase()}` });

  } catch (error) {
    console.error("Approval error:", error);
    res.status(500).json({ error: "Failed to process approval" });
  }
});

module.exports = router;