/* =====================================================
   APPROVE TASK COMPLETION (ADMIN)
   ===================================================== */
router.post("/approve-completion", adminOnly, async (req, res) => {
  const { completionId } = req.body;

  if (!completionId) return res.status(400).json({ error: "Missing completionId" });

  try {
    // Find the completion
    const completion = await prisma.taskCompletion.findUnique({
      where: { id: completionId },
      include: {
        task: true,
        user: true
      }
    });

    if (!completion) return res.status(404).json({ error: "Completion not found" });
    if (completion.approved) return res.status(400).json({ error: "Already approved" });

    const taskReward = completion.task.reward;

    // Platform cut (10% of reward)
    const platformCut = taskReward * 0.10;
    const payout = taskReward; // Worker receives exactly the reward

    // Update worker wallet
    await prisma.wallet.update({
      where: { userId: completion.userId },
      data: {
        balance: { increment: payout },
        locked: { decrement: taskReward },
        pendingEarnings: { decrement: taskReward } // assuming pendingEarnings tracks pending tasks
      }
    });

    // Update completion as approved and rewardPaid
    await prisma.taskCompletion.update({
      where: { id: completionId },
      data: {
        approved: true,
        rewardPaid: payout
      }
    });

    // Add platform earnings
    await prisma.platformBalance.updateMany({
      data: { totalEarnings: { increment: platformCut } }
    });

    res.json({ success: true, payout, platformCut });
  } catch (err) {
    console.error("❌ APPROVE TASK COMPLETION ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
