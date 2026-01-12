const express = require("express");
const prisma = require("../prismaClient");
const { requireUser, requireClient } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔒 All routes in this file require authentication AND Client Role
router.use(requireUser, requireClient);

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
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.fullName || "",
      country: req.user.country || "",
      role: req.user.role,
      walletBalance: wallet ? wallet.unusedBalance : 0.00
    });

  } catch (error) {
    console.error("Error fetching client profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ========================
// 1. GET CLIENT BALANCE
// ========================
router.get("/balance", async (req, res) => {
  try {
    const userId = req.user.id;
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId }
    });

    if (!wallet) return res.json({ balance: 0.00 });
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
// 3. CREATE NEW TASK
// ========================
router.post("/task", async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, type, desc, clientBudget, taskQty } = req.body;

    if (!title || !desc || !clientBudget || !taskQty) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const qty = parseInt(taskQty);
    const totalBudget = parseFloat(clientBudget);

    if (qty <= 0 || totalBudget <= 0) {
      return res.status(400).json({ error: "Quantity and Budget must be positive" });
    }

    const rewardPerWorker = totalBudget / qty;

    const newTask = await prisma.task.create({
      data: {
        clientId: userId,
        title: title,
        taskType: type,
        description: desc,
        instructions: desc,
        clientBudget: totalBudget,
        adminPrice: null,
        rewardPerWorker: rewardPerWorker,
        numberOfWorkers: qty,
        totalCost: totalBudget,
        status: "PENDING_PRICING" 
      }
    });

    res.status(201).json(newTask);

  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ========================
// 4. GET SUBMISSIONS (PENDING REVIEW)
// ========================
// Frontend calls: GET /api/client/submissions?taskId=XYZ
router.get("/submissions", async (req, res) => {
  try {
    const clientId = req.user.id;
    const { taskId } = req.query;

    // Find submissions for tasks owned by this client
    const submissions = await prisma.taskSubmission.findMany({
      where: {
        task: {
          clientId: clientId
        },
        ...(taskId && { taskId: taskId }) // Filter by task ID if provided
      },
      include: {
        task: { select: { title: true } }, // Include task title for display
        worker: { select: { email: true, fullName: true } } // Include worker info
      },
      orderBy: { submittedAt: 'desc' }
    });

    res.json(submissions);

  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// ========================
// 5. REVIEW SUBMISSION (APPROVE / REJECT)
// ========================
// Frontend calls: PUT /api/client/review
router.put("/review", async (req, res) => {
  try {
    const { submissionId, action } = req.body; // action: 'approve' or 'reject'

    if (!submissionId || !action) {
      return res.status(400).json({ error: "Submission ID and Action are required" });
    }

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: "Invalid action" });
    }

    // 1. Find Submission
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      include: { task: true }
    });

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    // 2. Verify Client owns this Task
    if (submission.task.clientId !== req.user.id) {
      return res.status(403).json({ error: "You do not own this task" });
    }

    // 3. Update Status
    const updateData = { status: action === 'approve' ? 'APPROVED' : 'REJECTED' };
    
    await prisma.taskSubmission.update({
      where: { id: submissionId },
      data: updateData
    });

    // 4. IF APPROVED: Pay the Worker
    if (action === 'approve') {
      // Find or Create Worker Wallet
      let workerWallet = await prisma.wallet.findUnique({
        where: { userId: submission.workerId }
      });

      if (!workerWallet) {
        workerWallet = await prisma.wallet.create({
          data: { userId: submission.workerId, unusedBalance: 0, lockedBalance: 0 }
        });
      }

      // Add Funds to Worker
      await prisma.wallet.update({
        where: { id: workerWallet.id },
        data: {
          unusedBalance: { increment: submission.task.rewardPerWorker }
        }
      });

      // (Optional) Create a Transaction record for the worker
      await prisma.walletTransaction.create({
        data: {
          walletId: workerWallet.id,
          type: "TASK_PAYMENT",
          amount: submission.task.rewardPerWorker,
          status: "COMPLETED"
        }
      });
    }

    res.json({ message: `Submission ${action}d successfully` });

  } catch (error) {
    console.error("Error reviewing submission:", error);
    res.status(500).json({ error: "Failed to review submission" });
  }
});

module.exports = router;