const express = require("express");
const prisma = require("../prismaClient.js");

const router = express.Router();

const MIN_TASK_COST = 5; // $5 minimum

function parseNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

// POST /api/client/task/create
router.post("/create", async (req, res) => {
  try {
    // TODO: replace this with authenticated user from middleware (recommended)
    const {
      clientId,
      title,
      description,
      taskType,
      instructions,
      proofRequired,
      rewardPerWorker,
      numberOfWorkers,
    } = req.body;

    if (!clientId || !title || rewardPerWorker == null || numberOfWorkers == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const reward = parseNumber(rewardPerWorker);
    const nWorkers = parseNumber(numberOfWorkers);

    if (reward === null || nWorkers === null || nWorkers <= 0 || reward <= 0) {
      return res.status(400).json({ error: "Invalid numeric values for reward or numberOfWorkers" });
    }

    // compute total cost and normalize to 2 decimal places
    const totalCostNum = Number((reward * nWorkers).toFixed(2));
    if (totalCostNum < MIN_TASK_COST) {
      return res.status(400).json({ error: `Task total cost must be at least $${MIN_TASK_COST}` });
    }

    // Use a transaction: check wallet, move funds, create task, create transaction record
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: clientId } });
      if (!wallet) return { error: "Wallet not found" };

      // Support older naming if present: prefer unusedBalance, fallback to balance
      const unusedBalanceValue = Number(wallet.unusedBalance ?? wallet.balance ?? 0);

      if (unusedBalanceValue < totalCostNum) return { error: "Insufficient funds" };

      // Update wallet: unusedBalance -= totalCost, lockedFunds += totalCost
      await tx.wallet.update({
        where: { userId: clientId },
        data: {
          // Prisma Decimal fields accept strings
          unusedBalance: { decrement: String(totalCostNum) },
          lockedFunds: { increment: String(totalCostNum) },
        },
      });

      // create task in PENDING_ADMIN_APPROVAL
      const task = await tx.task.create({
        data: {
          clientId,
          title,
          description: description ?? "",
          taskType: taskType ?? "general",
          instructions: instructions ?? "",
          proofRequired: !!proofRequired,
          rewardPerWorker: String(reward), // Decimal as string
          numberOfWorkers: Number(nWorkers),
          totalCost: String(totalCostNum),
          status: "PENDING_ADMIN_APPROVAL",
          submittedAt: new Date(),
          submittedBy: clientId,
        },
      });

      // create wallet transaction record (LOCK)
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "LOCK",
          amount: String(totalCostNum),
          platformFee: "0",
        },
      });

      return { task };
    });

    if (result.error) return res.status(400).json({ error: result.error });

    return res.status(201).json({
      message: "Task created and submitted for admin approval",
      task: result.task,
    });
  } catch (err) {
    console.error("create task error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;