const express = require("express");
const prisma = require("../prismaClient");
const { requireUser } = require("../middleware/authMiddleware");

const router = express.Router();

// 🔒 All routes in this file require authentication
router.use(requireUser);

// ========================
// 1. GET AVAILABLE TASKS
// ========================
// Frontend calls: GET /api/tasks
router.get("/", async (req, res) => {
  try {
    // Fetch tasks that are LIVE
    const tasks = await prisma.task.findMany({
      where: { status: "LIVE" },
      select: {
        id: true,
        title: true,
        description: true,
        taskType: true,
        rewardPerWorker: true,
        // Map DB field 'rewardPerWorker' to frontend 'pay'
        // Map DB field 'description' to frontend 'desc'
      }
    });

    // Format data to match Frontend expectations (pay, desc, etc.)
    const formattedTasks = tasks.map(t => ({
      ...t,
      pay: t.rewardPerWorker,
      desc: t.description,
      time: "~10 mins" // Default time for now
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

    if (!taskId || !proof) {
      return res.status(400).json({ error: "Task ID and Proof are required" });
    }

    // Check if user is verified
    if (req.user.verificationStatus !== "VERIFIED") {
      return res.status(403).json({ error: "You must be verified to submit tasks." });
    }

    // Create Submission Record
    const submission = await prisma.taskSubmission.create({
      data: {
        taskId: taskId,
        workerId: userId,
        proof: proof,
        status: "PENDING"
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

    // Update User
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
// 4. REQUEST WITHDRAWAL
// ========================
// Frontend calls: POST /api/client/withdraw
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, method, address } = req.body; // Frontend sends 'address' for details

    const withdrawAmount = parseFloat(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // 1. Find Wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId }
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // 2. Check Balance (using unusedBalance for withdrawable amount)
    if (wallet.unusedBalance < withdrawAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 3. Create Withdrawal Transaction
    // We use Decimal type conversion
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "WITHDRAWAL",
        amount: withdrawAmount,
        provider: method,
        externalData: { address: address }, // Storing address/details in JSON
        status: "PENDING"
      }
    });

    // 4. Deduct from Balance immediately (Locking funds)
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