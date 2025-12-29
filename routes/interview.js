const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

/**
 * GET /api/interview/me
 * Returns user's interview status and retry eligibility
 */
router.get("/me", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        interviewStatus: true,
        interviewSubmittedAt: true
      }
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const status = user.interviewStatus || "NOT_STARTED";
    let canRetryInterview = false;

    if (status === "REJECTED" && user.interviewSubmittedAt) {
      const last = new Date(user.interviewSubmittedAt).getTime();
      if (Date.now() - last >= THREE_DAYS) canRetryInterview = true;
    }

    res.json({
      role: user.role,
      interviewStatus: status,
      canRetryInterview
    });
  } catch (err) {
    console.error("Interview ME error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/interview/submit
 * Worker submits or retries interview
 */
router.post("/submit", async (req, res) => {
  try {
    const { userId, answers } = req.body;
    if (!userId || !answers) return res.status(400).json({ error: "Missing userId or answers" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = Date.now();
    const currentStatus = user.interviewStatus || "NOT_STARTED";

    // Restrict re-submission if already approved or pending review
    if (currentStatus === "APPROVED") return res.status(400).json({ error: "Interview already approved" });
    if (currentStatus === "PENDING_REVIEW") return res.status(400).json({ error: "Interview already submitted" });

    // Check retry eligibility for rejected interviews
    if (currentStatus === "REJECTED") {
      const last = user.interviewSubmittedAt ? new Date(user.interviewSubmittedAt).getTime() : 0;
      if (now - last < THREE_DAYS) {
        return res.status(400).json({ error: "You can retry after 3 days" });
      }
      // Delete old attempts before retry
      await prisma.interview.deleteMany({ where: { userId } });
    }

    // Create new interview
    await prisma.interview.create({
      data: {
        userId,
        answers,
        status: "PENDING_REVIEW"
      }
    });

    // Update user's interview status
    await prisma.user.update({
      where: { id: userId },
      data: {
        interviewStatus: "PENDING_REVIEW",
        interviewSubmittedAt: new Date()
      }
    });

    res.json({ success: true, message: "Interview submitted successfully" });
  } catch (err) {
    console.error("Interview submit error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/interview/admin/approve
 * Admin approves a worker's interview
 */
router.post("/admin/approve", async (req, res) => {
  try {
    const { interviewId } = req.body;
    if (!interviewId) return res.status(400).json({ error: "Missing interviewId" });

    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "APPROVED" }
    });

    await prisma.user.update({
      where: { id: interview.userId },
      data: { interviewStatus: "APPROVED" }
    });

    res.json({ success: true, message: "Interview approved" });
  } catch (err) {
    console.error("Interview approve error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/interview/admin/reject
 * Admin rejects a worker's interview
 */
router.post("/admin/reject", async (req, res) => {
  try {
    const { interviewId } = req.body;
    if (!interviewId) return res.status(400).json({ error: "Missing interviewId" });

    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    await prisma.interview.update({
      where: { id: interviewId },
      data: { status: "REJECTED" }
    });

    await prisma.user.update({
      where: { id: interview.userId },
      data: { interviewStatus: "REJECTED" }
    });

    res.json({ success: true, message: "Interview rejected" });
  } catch (err) {
    console.error("Interview reject error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
