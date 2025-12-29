const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");
const adminInterviewOnly = require("../middleware/adminInterviewOnly");

// 🔒 ADMIN ONLY (INTERVIEW REVIEW)
router.use(adminInterviewOnly);

/**
 * GET /api/interview/review/pending
 * Fetch all pending interviews for admin review
 */
router.get("/pending", async (req, res) => {
  try {
    const interviews = await prisma.interview.findMany({
      where: { status: "PENDING_REVIEW" },
      include: {
        user: {
          select: { id: true, email: true, createdAt: true }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    res.json(interviews);
  } catch (err) {
    console.error("❌ FETCH PENDING INTERVIEWS ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/interview/review/approve
 * Approve interview
 * Body: { interviewId }
 */
router.post("/approve", async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) return res.status(400).json({ error: "Missing interviewId" });

  try {
    const interview = await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "APPROVED", reviewedAt: new Date() }
    });

    await prisma.user.update({
      where: { id: interview.userId },
      data: { interviewStatus: "APPROVED" }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ APPROVE INTERVIEW ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/interview/review/reject
 * Reject interview with 3-day retry cooldown
 * Body: { interviewId }
 */
router.post("/reject", async (req, res) => {
  const { interviewId } = req.body;
  if (!interviewId) return res.status(400).json({ error: "Missing interviewId" });

  try {
    const retryAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days later

    const interview = await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "REJECTED", reviewedAt: new Date(), retryAfter }
    });

    await prisma.user.update({
      where: { id: interview.userId },
      data: { interviewStatus: "REJECTED" }
    });

    res.json({ success: true, retryAfter });
  } catch (err) {
    console.error("❌ REJECT INTERVIEW ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/interview/review/retry-status
 * Check if worker can retry interview
 * Query: ?userId=
 */
router.get("/retry-status", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const interview = await prisma.interview.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" } // get latest attempt
    });

    if (!interview) return res.json({ canRetry: false, message: "No interview found" });

    const now = new Date();
    const retryAfter = interview.retryAfter;

    if (!retryAfter || now >= retryAfter) return res.json({ canRetry: true });

    const hoursRemaining = Math.ceil((retryAfter - now) / (1000 * 60 * 60));
    res.json({ canRetry: false, retryAfter, hoursRemaining });

  } catch (err) {
    console.error("❌ RETRY STATUS ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
