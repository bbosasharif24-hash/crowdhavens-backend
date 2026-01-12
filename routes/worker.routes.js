const express = require("express");
const prisma = require("../prismaClient");
const { requireUser, requireWorker } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔒 GLOBAL MIDDLEWARE: 
// 1. Must be logged in
// 2. Must be a WORKER (Prevents clients from accessing worker endpoints)
router.use(requireUser, requireWorker);

// ========================
// 1. GET AVAILABLE TASKS
// ========================
// Frontend calls: GET /api/tasks
router.get("/", async (req, res) => {
  try {
    console.log(`[Worker Routes] Fetching tasks for user: ${req.user.email}`);
    
    const tasks = await prisma.task.findMany({
      where: { status: "LIVE" },
      select: {
        id: true,
        title: true,
        description: true,
        taskType: true,
        rewardPerWorker: true,
      }
    });

    // Format data to match Frontend expectations (pay, desc, etc.)
    const formattedTasks = tasks.map(t => ({
      ...t,
      pay: t.rewardPerWorker,
      desc: t.description,
      time: "~10 mins" 
    }));

    res.json(formattedTasks);

  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// ========================
// 2. SUBMIT TASK PROOF
// ========================
// Frontend calls: POST /api/tasks/submit
router.post("/submit", async (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId, proof, taskTitle } = req.body;

    console.log(`[Worker Routes] Task submission attempt by ${userId}`);

    if (!taskId || !proof) {
      return res.status(400).json({ error: "Task ID and Proof are required" });
    }

    if (req.user.verificationStatus !== "VERIFIED") {
      return res.status(403).json({ error: "You must be verified to submit tasks." });
    }

    // Create Submission Record
    const submission = await prisma.taskSubmission.create({
      data: {
        taskId: taskId,
        workerId: userId,
        proof: proof,
        status: "PENDING" // Tasks are pending approval (standard practice)
      }
    });

    res.status(201).json({ message: "Task submitted successfully", submission });

  } catch (error) {
    console.error("Error submitting task:", error);
    res.status(500).json({ error: "Failed to submit task" });
  }
});

// ========================
// 3. UPDATE PROFILE
// ========================
// Frontend calls: PUT /api/user/profile
router.put("/profile", async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, telephone, country, place, paymentEmail } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: fullName || undefined,
        telephone: telephone || undefined,
        country: country || undefined,
        place: place || undefined,
        paymentEmail: paymentEmail || undefined
      }
    });

    res.json({ message: "Profile updated", user: updatedUser });

  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ========================
// 4. REQUEST WITHDRAWAL (FIXED PATH)
// ========================
// Frontend needs to call: POST /api/worker/withdraw
router.post("/withdraw", async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, method, address } = req.body;

    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // 1. SAFETY CHECK: Does wallet exist? If not, create it (Auto-fix for dev)
    let wallet = await prisma.wallet.findUnique({
      where: { userId: userId }
    });

    if (!wallet) {
      console.log(`[Wallet] Wallet not found for ${userId}. Creating...`);
      wallet = await prisma.wallet.create({
        data: {
          userId: userId,
          unusedBalance: 0,
          lockedBalance: 0
        }
      });
    }

    // 2. Check Balance
    if (wallet.unusedBalance < withdrawAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 3. Create Withdrawal Transaction
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "WITHDRAWAL",
        amount: withdrawAmount,
        provider: method,
        externalData: { address: address },
        status: "PENDING"
      }
    });

    // 4. Deduct from Balance
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        unusedBalance: { decrement: withdrawAmount }
      }
    });

    res.json({ message: "Withdrawal request submitted successfully" });

  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

module.exports = router;