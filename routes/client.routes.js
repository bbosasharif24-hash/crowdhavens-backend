const express = require("express");
const prisma = require("../prismaClient");
const { requireUser } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔒 All routes in this file require authentication
router.use(requireUser);

// ========================
// 0. GET CLIENT PROFILE & BALANCE
// ========================
router.get("/me", async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Get Wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId }
    });

    // 2. Return combined data
    res.json({
      // User Profile Data
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.fullName || "", // Safe access
      country: req.user.country || "",
      place: req.user.place || "",
      telephone: req.user.telephone || "",
      role: req.user.role,
      
      // Wallet Data
      walletBalance: wallet ? wallet.unusedBalance : 0.00
    });

  } catch (error) {
    console.error("Error fetching client profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ========================
// 1. GET CLIENT BALANCE (Legacy Support)
// ========================
router.get("/balance", async (req, res) => {
  try {
    // req.user is attached by our middleware
    const userId = req.user.id;

    // Find wallet for this user
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId }
    });

    if (!wallet) {
      // Return 0 if no wallet exists yet
      return res.json({ balance: 0.00 });
    }

    res.json({ balance: wallet.unusedBalance });

  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// ========================
// 2. GET CLIENT TASKS
// ========================
router.get("/tasks", async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all tasks where clientId matches the logged-in user
    const tasks = await prisma.task.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tasks);

  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ========================
// 3. CREATE NEW TASK (PROPOSAL)
// ========================
router.post("/task", async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, type, desc, clientBudget, taskQty } = req.body;

    // Validation
    if (!title || !desc || !clientBudget || !taskQty) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const qty = parseInt(taskQty);
    const totalBudget = parseFloat(clientBudget);

    if (qty <= 0 || totalBudget <= 0) {
      return res.status(400).json({ error: "Quantity and Budget must be positive" });
    }

    // Calculate per-worker pay
    // Note: We assume clientBudget is the TOTAL amount they want to spend
    const rewardPerWorker = totalBudget / qty;

    // Create the Task
    const newTask = await prisma.task.create({
      data: {
        clientId: userId,
        title: title,
        taskType: type, // Mapping frontend 'type' to schema 'taskType'
        description: desc,
        instructions: desc, // Re-using description for instructions for now
        clientBudget: totalBudget,
        adminPrice: null, // Admin sets this later
        rewardPerWorker: rewardPerWorker,
        numberOfWorkers: qty,
        totalCost: totalBudget,
        status: "PENDING_PRICING" // Skip DRAFT, go straight to Admin Review
      }
    });

    res.status(201).json(newTask);

  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

module.exports = router;