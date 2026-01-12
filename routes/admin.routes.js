const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// ================= MIDDLEWARE =================
// Simple check to ensure user is admin
const isAdmin = async (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  req.user = user; // Attach user to request
  next();
};

// Apply to all routes
router.use(isAdmin);

// ================= HELPERS =================
// Helper to safely convert Prisma Decimals to Numbers for JSON responses
const safeJson = (data) => {
  return JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
};

// ================= ROUTES =================

// 1. STATS OVERVIEW
router.get("/stats", async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. VERIFICATIONS ($1 Fee)
router.get("/verifications", async (req, res) => {
  try {
    const verifications = await prisma.verificationRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { fullName: true, email: true } } }
    });
    res.json(verifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/verifications/:id/:action(approve|reject)", async (req, res) => {
  const { id, action } = req.params;
  
  try {
    const verif = await prisma.verificationRequest.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!verif) return res.status(404).json({ error: "Request not found" });
    if (verif.status !== "PENDING") return res.status(400).json({ error: "Already processed" });

    const newStatus = action === "approve" ? "APPROVED" : "REJECTED";

    // Update Request Status
    await prisma.verificationRequest.update({
      where: { id },
      data: { status: newStatus }
    });

    // If Approved
    if (action === "approve") {
      // 1. Update User Verification Status
      await prisma.user.update({
        where: { id: verif.userId },
        data: { verificationStatus: "VERIFIED", emailVerified: true }
      });

      // 2. Handle Referral ($0.50 Bonus)
      if (verif.user.referredBy && !verif.referralTriggered) {
        const referrer = await prisma.user.findUnique({
          where: { email: verif.user.referredBy },
          include: { wallet: true }
        });

        if (referrer && referrer.wallet) {
          await prisma.referralPayout.create({
            data: {
              referrerEmail: referrer.email,
              newUserEmail: verif.user.email,
              amount: 0.50,
              status: "LOGGED"
            }
          });

          await prisma.wallet.update({
            where: { id: referrer.wallet.id },
            data: { unusedBalance: { increment: 0.50 } }
          });

          await prisma.verificationRequest.update({
            where: { id },
            data: { referralTriggered: true }
          });
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Verification Action Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. CLIENT TASKS (Pricing)
router.get("/tasks/pending-pricing", async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { status: "PENDING_PRICING" },
      include: { client: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tasks/:id/set-price", async (req, res) => {
  const { id } = req.params;
  const { action, adminPrice } = req.body;

  try {
    if (action === "rejected") {
      await prisma.task.update({
        where: { id },
        data: { status: "REJECTED", rejectionReason: "Admin rejected proposal" }
      });
    } else if (action === "approved") {
      const task = await prisma.task.findUnique({ where: { id } });
      const totalCost = parseFloat(adminPrice) * task.numberOfWorkers;

      await prisma.task.update({
        where: { id },
        data: {
          adminPrice: parseFloat(adminPrice),
          totalCost: totalCost,
          status: "AWAITING_FUNDING"
        }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Task Pricing Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. CLIENT FUNDS (Deposits)
router.get("/transactions/pending-deposits", async (req, res) => {
  try {
    const txs = await prisma.walletTransaction.findMany({
      where: { type: "DEPOSIT", status: "PENDING" },
      include: {
        wallet: {
          include: {
            user: { select: { fullName: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/transactions/:id/approve-deposit", async (req, res) => {
  const { id } = req.params;

  try {
    const tx = await prisma.walletTransaction.findUnique({
      where: { id },
      include: { wallet: true }
    });

    if (!tx || tx.type !== "DEPOSIT" || tx.status !== "PENDING") {
      return res.status(400).json({ error: "Invalid transaction" });
    }

    await prisma.walletTransaction.update({
      where: { id },
      data: { status: "CONFIRMED" }
    });

    await prisma.wallet.update({
      where: { id: tx.walletId },
      data: {
        totalDeposited: { increment: parseFloat(tx.amount) },
        unusedBalance: { increment: parseFloat(tx.amount) }
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Deposit Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. WITHDRAWALS
router.get("/transactions/pending-withdrawals", async (req, res) => {
  try {
    const txs = await prisma.walletTransaction.findMany({
      where: { type: "WITHDRAWAL", status: "PENDING" },
      include: {
        wallet: {
          include: {
            user: { select: { fullName: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/transactions/:id/approve-withdrawal", async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.walletTransaction.update({
      where: { id },
      data: { status: "CONFIRMED" } 
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Withdrawal Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6. TASK SUBMISSIONS
router.get("/submissions/pending", async (req, res) => {
  try {
    const subs = await prisma.taskSubmission.findMany({
      where: { status: "PENDING" },
      include: {
        task: { select: { title: true, rewardPerWorker: true } },
        worker: { select: { email: true } }
      },
      orderBy: { submittedAt: "desc" }
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/submissions/:id/:action(approve|reject)", async (req, res) => {
  const { id, action } = req.params;

  try {
    const sub = await prisma.taskSubmission.findUnique({
      where: { id },
      include: {
        task: true,
        worker: { include: { wallet: true } }
      }
    });

    if (!sub) return res.status(404).json({ error: "Submission not found" });

    const newStatus = action === "approve" ? "APPROVED" : "REJECTED";

    await prisma.taskSubmission.update({
      where: { id },
      data: { status: newStatus }
    });

    if (action === "approve") {
      const reward = parseFloat(sub.task.rewardPerWorker);

      await prisma.wallet.update({
        where: { id: sub.worker.walletId },
        data: { unusedBalance: { increment: reward } }
      });

      const client = await prisma.user.findUnique({
        where: { id: sub.task.clientId },
        include: { wallet: true }
      });

      if (client && client.wallet) {
        await prisma.wallet.update({
          where: { id: client.wallet.id },
          data: { lockedFunds: { decrement: reward } }
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Submission Action Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. REFERRALS
router.get("/referrals", async (req, res) => {
  try {
    const refs = await prisma.referralPayout.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json(refs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. CREATE TASK (Admin Direct) - UPDATED
router.post("/tasks/create", async (req, res) => {
  try {
    const { title, type, description, rewardPerWorker, numberOfWorkers } = req.body;
    
    // --- VALIDATION ---
    if (!title || !description || !rewardPerWorker || !numberOfWorkers) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    // Ensure number of workers is a valid integer >= 1
    const numWorkers = parseInt(numberOfWorkers);
    if (numWorkers < 1) {
        return res.status(400).json({ error: "Number of workers must be at least 1." });
    }

    const reward = parseFloat(rewardPerWorker);
    const totalCost = reward * numWorkers;

    // Use Admin ID as clientId
    const clientId = req.user.id;

    await prisma.task.create({
      data: {
        clientId,
        title,
        taskType: type,
        description,
        instructions: description, 
        rewardPerWorker: reward,
        numberOfWorkers: numWorkers,
        totalCost: parseFloat(totalCost),
        clientBudget: parseFloat(totalCost),
        adminPrice: parseFloat(totalCost),
        status: "LIVE",
        proofRequired: true // <--- FIXED: Missing field added
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Create Task Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;