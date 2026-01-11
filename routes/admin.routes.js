const express = require("express");
const prisma = require("../prismaClient");
const { requireUser } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔒 All routes in this file require authentication
router.use(requireUser);

// ========================
// 1. OVERVIEW STATS
// ========================
router.get("/stats", async (req, res) => {
  try {
    // Ensure user is ADMIN
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const [
      pendingTasks,
      pendingFunding,
      pendingVerifications,
      pendingWithdrawals,
      pendingSubmissions,
      liveTasks
    ] = await Promise.all([
      prisma.task.count({ where: { status: "PENDING_PRICING" } }),
      prisma.walletTransaction.count({ where: { type: "DEPOSIT", status: "PENDING" } }),
      prisma.verificationRequest.count({ where: { status: "PENDING" } }),
      prisma.walletTransaction.count({ where: { type: "WITHDRAWAL", status: "PENDING" } }),
      prisma.taskSubmission.count({ where: { status: "PENDING" } }),
      prisma.task.count({ where: { status: "LIVE" } })
    ]);

    res.json({
      pendingTasks,
      pendingFunding,
      pendingVerifications,
      pendingWithdrawals,
      pendingSubmissions,
      liveTasks
    });

  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ========================
// 2. VERIFICATIONS ($1)
// ========================

// GET Pending Verifications
router.get("/verifications", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const requests = await prisma.verificationRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { email: true, fullName: true, referredBy: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);

  } catch (error) {
    console.error("Error fetching verifications:", error);
    res.status(500).json({ error: "Failed to fetch verifications" });
  }
});

// Approve Verification
router.post("/verifications/:id/approve", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });
    
    const { id } = req.params;

    // 1. Update Request Status
    const reqRecord = await prisma.verificationRequest.update({
      where: { id: id },
      data: { status: "APPROVED" },
      include: { user: true }
    });

    // 2. Update User Status
    await prisma.user.update({
      where: { id: reqRecord.userId },
      data: { verificationStatus: "VERIFIED" }
    });

    // 3. Handle Referral Bonus ($0.50)
    if (reqRecord.user.referredBy) {
      // Find referrer (User.referredBy stores email)
      const referrer = await prisma.user.findUnique({
        where: { email: reqRecord.user.referredBy }
      });

      if (referrer) {
        await prisma.referralPayout.create({
          data: {
            referrerEmail: referrer.email,
            newUserEmail: reqRecord.user.email,
            amount: 0.50,
            status: "LOGGED"
          }
        });
        // Optional: Add to referrer wallet immediately or require manual payout
        // For now, we just LOG it as per schema
      }
    }

    res.json({ message: "Verification approved" });

  } catch (error) {
    console.error("Error approving verification:", error);
    res.status(500).json({ error: "Failed to approve verification" });
  }
});

// Reject Verification
router.post("/verifications/:id/reject", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    await prisma.verificationRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED" }
    });

    res.json({ message: "Verification rejected" });

  } catch (error) {
    console.error("Error rejecting verification:", error);
    res.status(500).json({ error: "Failed to reject verification" });
  }
});

// ========================
// 3. CLIENT TASKS (PRICING)
// ========================

// GET Pending Pricing Tasks
router.get("/tasks/pending-pricing", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const tasks = await prisma.task.findMany({
      where: { status: "PENDING_PRICING" },
      include: { 
        client: { select: { fullName: true, email: true, id: true } } 
      }
    });

    res.json(tasks);

  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// Set Price & Approve Task
router.post("/tasks/:id/set-price", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const { id } = req.params;
    const { adminPrice, action } = req.body;

    if (action === "rejected") {
      await prisma.task.update({
        where: { id: id },
        data: { status: "REJECTED", rejectionReason: "Admin rejected proposal" }
      });
      return res.json({ message: "Task rejected" });
    }

    if (!adminPrice) return res.status(400).json({ error: "Price is required" });

    // Update Task
    const task = await prisma.task.update({
      where: { id: id },
      data: {
        adminPrice: parseFloat(adminPrice),
        status: "AWAITING_FUNDING" // Client must now deposit
      }
    });

    res.json(task);

  } catch (error) {
    console.error("Error setting price:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ========================
// 4. CLIENT FUNDS (DEPOSITS)
// ========================

// GET Pending Deposits
router.get("/transactions/pending-deposits", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const deposits = await prisma.walletTransaction.findMany({
      where: { type: "DEPOSIT", status: "PENDING" },
      include: { wallet: { include: { user: { select: { fullName: true, email: true } } } } }
    });

    res.json(deposits);

  } catch (error) {
    console.error("Error fetching deposits:", error);
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

// Approve Deposit (Adds funds to wallet)
router.post("/transactions/:id/approve-deposit", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const { id } = req.params;
    
    // Get Transaction
    const tx = await prisma.walletTransaction.findUnique({ where: { id } });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    // 1. Update Transaction Status
    await prisma.walletTransaction.update({
      where: { id: id },
      data: { status: "CONFIRMED" }
    });

    // 2. Add to Wallet
    await prisma.wallet.update({
      where: { id: tx.walletId },
      data: { 
        unusedBalance: { increment: tx.amount },
        totalDeposited: { increment: tx.amount }
      }
    });

    // 3. Check if linked to a task (via externalData)
    // Note: You'll need to store taskId in externalData when creating the deposit request on frontend.
    // Assuming externalData looks like { taskId: "..." }
    // @ts-ignore
    if (tx.externalData && tx.externalData.taskId) {
      // @ts-ignore
      const taskId = tx.externalData.taskId;
      
      // Check if task exists and is waiting
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      
      if (task && task.status === "AWAITING_FUNDING") {
        // Task becomes LIVE!
        await prisma.task.update({
          where: { id: taskId },
          data: { status: "LIVE" }
        });
      }
    }

    res.json({ message: "Deposit approved, wallet updated" });

  } catch (error) {
    console.error("Error approving deposit:", error);
    res.status(500).json({ error: "Failed to approve deposit" });
  }
});

// ========================
// 5. WITHDRAWALS
// ========================

// GET Pending Withdrawals
router.get("/transactions/pending-withdrawals", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const withdrawals = await prisma.walletTransaction.findMany({
      where: { type: "WITHDRAWAL", status: "PENDING" },
      include: { wallet: { include: { user: { select: { fullName: true, email: true } } } } }
    });

    res.json(withdrawals);

  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// Approve Withdrawal
router.post("/transactions/:id/approve-withdrawal", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    await prisma.walletTransaction.update({
      where: { id: req.params.id },
      data: { status: "CONFIRMED" }
    });

    res.json({ message: "Withdrawal marked as paid" });

  } catch (error) {
    console.error("Error approving withdrawal:", error);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

// ========================
// 6. TASK SUBMISSIONS
// ========================

// GET Pending Submissions
router.get("/submissions/pending", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const subs = await prisma.taskSubmission.findMany({
      where: { status: "PENDING" },
      include: {
        task: { select: { title: true, rewardPerWorker: true } },
        worker: { select: { email: true, fullName: true } }
      },
      orderBy: { submittedAt: 'desc' }
    });

    res.json(subs);

  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// Approve Submission (Pay Worker)
router.post("/submissions/:id/approve", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const { id } = req.params;

    // Get Submission with Task details
    const sub = await prisma.taskSubmission.findUnique({
      where: { id },
      include: { task: true }
    });

    if (!sub) return res.status(404).json({ error: "Submission not found" });

    // 1. Update Submission
    await prisma.taskSubmission.update({
      where: { id },
      data: { status: "APPROVED" }
    });

    // 2. Pay Worker (Add to Wallet)
    await prisma.wallet.update({
      where: { userId: sub.workerId },
      data: { unusedBalance: { increment: sub.task.rewardPerWorker } }
    });

    // 3. Record Transaction for Worker
    const workerWallet = await prisma.wallet.findUnique({ where: { userId: sub.workerId } });
    if (workerWallet) {
      await prisma.walletTransaction.create({
        data: {
          walletId: workerWallet.id,
          type: "DEPOSIT", // It's a deposit from platform to worker
          amount: sub.task.rewardPerWorker,
          status: "CONFIRMED",
          provider: "Task Reward"
        }
      });
    }

    res.json({ message: "Submission approved and worker paid" });

  } catch (error) {
    console.error("Error approving submission:", error);
    res.status(500).json({ error: "Failed to approve submission" });
  }
});

// Reject Submission
router.post("/submissions/:id/reject", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    await prisma.taskSubmission.update({
      where: { id: req.params.id },
      data: { status: "REJECTED" }
    });

    res.json({ message: "Submission rejected" });

  } catch (error) {
    console.error("Error rejecting submission:", error);
    res.status(500).json({ error: "Failed to reject submission" });
  }
});

// ========================
// 7. REFERRALS
// ========================

// GET Referrals
router.get("/referrals", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const refs = await prisma.referralPayout.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json(refs);

  } catch (error) {
    console.error("Error fetching referrals:", error);
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
});

// ========================


  // ========================
// 8. ADMIN CREATE TASK
// ========================
router.post("/tasks/create", async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admin only" });

    const { title, type, description, rewardPerWorker, numberOfWorkers, totalCost } = req.body;

    // 1. Validation
    if (!title || !type || !description) {
      return res.status(400).json({ error: "Missing required text fields" });
    }

    const workers = parseInt(numberOfWorkers);
    const reward = parseFloat(rewardPerWorker);
    const total = parseFloat(totalCost);

    if (isNaN(workers) || isNaN(reward) || isNaN(total)) {
      return res.status(400).json({ error: "Invalid numeric values" });
    }

    // 2. Create Task
    const newTask = await prisma.task.create({
      data: {
        clientId: req.user.id, // Auth ensures this exists
        title: title,
        taskType: type,         // Frontend sends 'type'
        description: description,
        instructions: description,
        rewardPerWorker: reward, // Prisma Decimal
        numberOfWorkers: workers,   // Prisma Int
        totalCost: total,         // Prisma Decimal
        clientBudget: total,
        adminPrice: reward,         // Admin sets final price directly
        status: "LIVE"             // Admin tasks go live immediately
      }
    });

    res.json(newTask);

  } catch (error) {
    console.error("Error creating admin task:", error);
    // Catch Prisma validation errors specifically
    if (error.code === 'P2002') { 
       return res.status(400).json({ error: "Invalid data input" });
    }
    res.status(500).json({ error: "Failed to create task" });
  }
});

module.exports = router;