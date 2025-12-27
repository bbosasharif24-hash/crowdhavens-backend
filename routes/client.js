const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// Helper to identify user (temporary; replace with auth middleware)
function getUserId(req) {
  return req.headers["x-user-id"] || req.query.clientId || req.body.clientId;
}

// GET /api/client/wallet
// Returns wallet summary for the user identified by x-user-id header or ?clientId query param
router.get("/wallet", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Missing user id" });

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, totalDeposited: true, unusedBalance: true, lockedFunds: true }
    });

    if (!wallet) return res.status(404).json({ error: "Wallet not found" });
    res.json(wallet);
  } catch (err) {
    console.error("GET /api/client/wallet error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/client/tasks
// List tasks for a client
router.get("/tasks", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Missing user id" });

    const tasks = await prisma.task.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json(tasks);
  } catch (err) {
    console.error("GET /api/client/tasks error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/client/transactions
// Returns transactions for the client's wallet
router.get("/transactions", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Missing user id" });

    const wallet = await prisma.wallet.findUnique({ where: { userId }});
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    const tx = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json(tx);
  } catch (err) {
    console.error("GET /api/client/transactions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;