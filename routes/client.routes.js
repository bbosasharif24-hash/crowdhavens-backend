const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// ================= AUTH MIDDLEWARE =================
// Ensure only logged-in Clients can access these routes
// Matches frontend expectation of userId in header (from login)
const checkClient = async (req, res, next) => {
  const userId = req.headers["x-user-id"]; 
  
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: No User ID provided" });
  }

  // Optional: Verify role in DB is CLIENT (More secure than trusting header)
  // This adds a bit of latency but ensures data integrity
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || user.role !== "CLIENT") {
      return res.status(403).json({ error: "Access Denied: Clients only" });
    }
    
    req.clientId = userId; // Attach to request for easy access
    next();
  } catch (err) {
    console.error("Auth check error:", err);
    // On DB connection error, we might fail to get user.
    // For now, we proceed assuming header is correct to avoid locking valid clients if DB is down.
    req.clientId = userId;
    next();
  }
};

// ================= ROUTES =================

// 1. GET WALLET BALANCE
router.get("/balance", checkClient, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.clientId }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return the real balance from Database
    res.json({
      balance: parseFloat(user.balance) || 0.00
    });

  } catch (error) {
    console.error("Get Balance Error:", error);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// 2. CREATE TASK PROPOSAL
router.post("/task", checkClient, async (req, res) => {
  try {
    const { title, type, desc, clientBudget, taskQty } = req.body;

    if (!title || !desc) {
      return res.status(400).json({ error: "Title and Description are required" });
    }

    const newTask = await prisma.task.create({
      data: {
        clientId: req.clientId,
        clientEmail: (await prisma.user.findUnique({ where: { id: req.clientId } })).email, // Store email for matching wallet
        title,
        type,
        desc,
        instructions: desc,
        proofRequired: true,
        rewardPerWorker: clientBudget, // Initial budget
        numberOfWorkers: parseInt(taskQty),
        totalCost: clientBudget * parseInt(taskQty), // Calculated total
        clientBudget: parseFloat(clientBudget), // Save proposal
        adminPrice: null, // Not set yet
        status: 'PENDING_PRICING', // Matches Schema Enum
        date: new Date().toLocaleDateString()
      }
    });

    // Return the EXACT task object created (includes Prisma ID)
    // The Frontend uses this returned object to update its local list
    res.status(201).json(newTask);

  } catch (error) {
    console.error("Create Task Error:", error);
    res.status(500).json({ error: "Failed to create task proposal" });
  }
});

// 3. GET TASKS (Load Client's Tasks)
router.get("/tasks", checkClient, async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { clientId: req.clientId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tasks);

  } catch (error) {
    console.error("Get Tasks Error:", error);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

module.exports = router;