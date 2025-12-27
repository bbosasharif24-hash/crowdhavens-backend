const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const adminInterviewOnly = require("../middleware/adminInterviewOnly");

/* =====================================================
   🔒 ADMIN ONLY (INTERVIEW REVIEW)
   ===================================================== */
router.use(adminInterviewOnly);

/* =====================================================
   📋 GET PENDING INTERVIEWS
   ===================================================== */
router.get("/pending", async (req, res) => {
  try {
    const interviews = await prisma.interview.findMany({
      where: {
        status: "PENDING_REVIEW" // MUST MATCH ENUM
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    res.json(interviews);
  } catch (err) {
    console.error("❌ FETCH PENDING INTERVIEWS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   ✅ APPROVE INTERVIEW
   ===================================================== */
router.post("/approve", async (req, res) => {
  const { interviewId } = req.body;

  if (!interviewId) {
    return res.status(400).json({ error: "Missing interviewId" });
  }

  try {
    const interview = await prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date()
      }
    });

    await prisma.user.update({
      where: { id: interview.userId },
      data: {
        interviewStatus: "APPROVED"
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ APPROVE INTERVIEW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   ❌ REJECT INTERVIEW (3 DAYS COOLDOWN)
   ===================================================== */
router.post("/reject", async (req, res) => {
  const { interviewId } = req.body;

  if (!interviewId) {
    return res.status(400).json({ error: "Missing interviewId" });
  }

  try {
    // Set retryAfter 3 days from now
    const retryAfter = new Date();
    retryAfter.setDate(retryAfter.getDate() + 3);

    const interview = await prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        retryAfter // must exist in Prisma schema
      }
    });

    await prisma.user.update({
      where: { id: interview.userId },
      data: {
        interviewStatus: "REJECTED"
      }
    });

    res.json({ success: true, retryAfter });
  } catch (err) {
    console.error("❌ REJECT INTERVIEW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================================================
   ⏳ GET RETRY STATUS (FOR WORKERS)
   ===================================================== */
router.get("/retry-status", async (req, res) => {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const interview = await prisma.interview.findUnique({
      where: { userId }
    });

    if (!interview) {
      return res.json({ canRetry: false, message: "No interview found" });
    }

    const now = new Date();
    const retryAfter = interview.retryAfter;

    if (!retryAfter || now >= retryAfter) {
      return res.json({ canRetry: true });
    }

    const hoursRemaining = Math.ceil((retryAfter - now) / (1000 * 60 * 60));
    res.json({ canRetry: false, retryAfter, hoursRemaining });
  } catch (err) {
    console.error("❌ RETRY STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
