const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

/**
 * GET /api/interview/me
 * Frontend gatekeeper for interview flow
 */
router.get("/me", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        interviewStatus: true,
        interviewSubmittedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let canRetryInterview = false;

    if (
      user.interviewStatus === "REJECTED" &&
      user.interviewSubmittedAt
    ) {
      const last = new Date(user.interviewSubmittedAt).getTime();
      const now = Date.now();

      if (now - last >= THREE_DAYS) {
        canRetryInterview = true;
      }
    }

    res.json({
      role: user.role,
      interviewStatus: user.interviewStatus || "NOT_STARTED",
      canRetryInterview
    });

  } catch (err) {
    console.error("Interview ME error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/interview/submit
 * Worker submits interview
 */
router.post("/submit", async (req, res) => {
  try {
    const { userId, answers } = req.body;

    if (!userId || !answers) {
      return res.status(400).json({ error: "Missing userId or answers" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    /* 🔒 APPROVED → NEVER AGAIN */
    if (user.interviewStatus === "APPROVED") {
      return res.status(400).json({
        error: "Interview already approved"
      });
    }

    /* 🔒 REJECTED BUT TOO EARLY */
    if (user.interviewStatus === "REJECTED") {
      const last = new Date(user.interviewSubmittedAt).getTime();
      const now = Date.now();

      if (now - last < THREE_DAYS) {
        return res.status(400).json({
          error: "You can retry the interview after 3 days"
        });
      }

      // ✅ Retry allowed → clear old attempts
      await prisma.interview.deleteMany({
        where: { userId }
      });
    }

    /* 🔒 ALREADY SUBMITTED */
    if (user.interviewStatus === "PENDING_REVIEW") {
      return res.status(400).json({
        error: "Interview already submitted"
      });
    }

    /* ✅ CREATE INTERVIEW */
    await prisma.interview.create({
      data: {
        userId,
        answers,
        status: "PENDING_REVIEW"
      }
    });

    /* ✅ UPDATE USER */
    await prisma.user.update({
      where: { id: userId },
      data: {
        interviewStatus: "PENDING_REVIEW",
        interviewSubmittedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: "Interview submitted successfully"
    });

  } catch (err) {
    console.error("Interview submit error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
