const express = require("express");
const router = express.Router();
const auth = require("../middleware/authDashboard");
const { prisma } = require("../prismaClient");

// Get dashboard data
router.get("/dashboard", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { wallet: true, tasks: true },
  });
  const transactions = user.wallet
    ? await prisma.transaction.findMany({ where: { walletId: user.wallet.id } })
    : [];
  res.json({
    worker: {
      ...user,
      earned: user.wallet?.earned || 0,
      pending: user.wallet?.pending || 0,
      bonus: user.wallet?.bonus || 0,
      tasks: user.tasks,
      transactions,
      profile: user,
    },
  });
});

// Claim task
router.post("/tasks/claim", auth, async (req, res) => {
  const { taskId } = req.body;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (task.status !== "Available") return res.status(400).json({ error: "Task not available" });
  await prisma.task.update({ where: { id: taskId }, data: { status: "Claimed", assignedTo: req.userId } });
  res.json({ success: true });
});

// Complete task
router.post("/tasks/complete", auth, async (req, res) => {
  const { taskId } = req.body;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (task.status !== "Claimed") return res.status(400).json({ error: "Task not claimed" });
  await prisma.task.update({ where: { id: taskId }, data: { status: "Completed" } });

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
  await prisma.wallet.update({
    where: { userId: req.userId },
    data: {
      earned: wallet.earned + task.reward,
      transactions: { create: { type: "Reward", amount: task.reward } },
    },
  });

  res.json({ success: true });
});

// Wallet withdraw
router.post("/wallet/withdraw", auth, async (req, res) => {
  const { method } = req.body;
  // Integrate AirTM/PayPal withdraw logic here
  res.json({ success: true, message: `Withdrawal via ${method} requested` });
});

// Update profile
router.put("/profile", auth, async (req, res) => {
  const data = req.body;
  // Handle profile picture upload separately (e.g., multer)
  await prisma.user.update({ where: { id: req.userId }, data });
  res.json({ success: true });
});

module.exports = router;
