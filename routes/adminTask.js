const express = require("express");
const prisma = require("../prismaClient.js");

const router = express.Router();

/**
 * NOTE:
 * - This file replaces the previous admin task routes.
 * - It performs DB updates inside prisma transactions so wallet and task changes are atomic.
 * - It expects an admin identifier to be provided via header `x-user-id` or req.body.adminId.
 *   Replace this with your real auth middleware (recommended).
 */

/* Approve / Publish Task (move client's lockedFunds -> admin escrow and set LIVE) */
router.post("/approve", async (req, res) => {
  try {
    const { taskId } = req.body;
    const adminId = req.headers["x-user-id"] || req.body.adminId;

    if (!adminId) return res.status(401).json({ error: "Missing admin id" });
    if (!taskId) return res.status(400).json({ error: "taskId required" });

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) return { error: "Task not found" };
      if (task.status !== "PENDING_ADMIN_APPROVAL")
        return { error: "Task not pending approval" };

      const totalCost = Number(Number(task.totalCost).toFixed(2));

      // load client wallet
      const clientWallet = await tx.wallet.findUnique({ where: { userId: task.clientId } });
      if (!clientWallet) return { error: "Client wallet not found" };

      const clientLocked = Number(clientWallet.lockedFunds ?? 0);
      if (clientLocked < totalCost) return { error: "Client locked funds insufficient" };

      // decrement client lockedFunds
      await tx.wallet.update({
        where: { userId: task.clientId },
        data: { lockedFunds: { decrement: String(totalCost) } },
      });

      // find admin user and wallet (platform)
      const adminUser = await tx.user.findFirst({ where: { role: "ADMIN" } });
      if (!adminUser) throw new Error("Admin user not found - seed an ADMIN user before publishing tasks");

      let adminWallet = await tx.wallet.findUnique({ where: { userId: adminUser.id } });
      if (!adminWallet) {
        adminWallet = await tx.wallet.create({
          data: {
            userId: adminUser.id,
            totalDeposited: "0",
            unusedBalance: "0",
            lockedFunds: "0",
          },
        });
      }

      // credit admin wallet with totalCost (escrow)
      const updatedAdminWallet = await tx.wallet.update({
        where: { userId: adminUser.id },
        data: { unusedBalance: { increment: String(totalCost) } },
      });

      // record ESCROW tx on admin wallet
      await tx.walletTransaction.create({
        data: {
          walletId: adminWallet.id,
          type: "ESCROW",
          amount: String(totalCost),
        },
      });

      // record UNLOCK/TRANSFER-like tx on client wallet for audit
      await tx.walletTransaction.create({
        data: {
          walletId: clientWallet.id,
          type: "UNLOCK",
          amount: String(totalCost),
        },
      });

      // set task LIVE and record admin action
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: {
          status: "LIVE",
          adminEditedAt: new Date(),
          adminEditedBy: adminId,
        },
      });

      return { task: updatedTask };
    });

    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({ message: "Task approved and is now LIVE", task: result.task });
  } catch (err) {
    console.error("admin approve error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* Reject Task (return locked funds back to client's usable balance, close task) */
router.post("/reject", async (req, res) => {
  try {
    const { taskId, reason } = req.body;
    const adminId = req.headers["x-user-id"] || req.body.adminId;

    if (!adminId) return res.status(401).json({ error: "Missing admin id" });
    if (!taskId || !reason) return res.status(400).json({ error: "taskId and reason required" });

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) return { error: "Task not found" };
      if (task.status !== "PENDING_ADMIN_APPROVAL")
        return { error: "Task not pending approval" };

      const totalCost = Number(Number(task.totalCost).toFixed(2));

      // load client wallet
      const clientWallet = await tx.wallet.findUnique({ where: { userId: task.clientId } });
      if (!clientWallet) return { error: "Client wallet not found" };

      const clientLocked = Number(clientWallet.lockedFunds ?? 0);
      if (clientLocked < totalCost) {
        // This is unexpected, but we should still attempt to reconcile: set locked to 0 and add what we can back
        return { error: "Client locked funds insufficient to return" };
      }

      // Move funds back: lockedFunds -= totalCost, unusedBalance += totalCost
      await tx.wallet.update({
        where: { userId: task.clientId },
        data: {
          lockedFunds: { decrement: String(totalCost) },
          unusedBalance: { increment: String(totalCost) },
        },
      });

      // record UNLOCK tx on client wallet
      await tx.walletTransaction.create({
        data: {
          walletId: clientWallet.id,
          type: "UNLOCK",
          amount: String(totalCost),
        },
      });

      // close task with rejection reason
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: {
          status: "CLOSED",
          rejectionReason: reason,
          adminEditedAt: new Date(),
          adminEditedBy: adminId,
        },
      });

      return { task: updatedTask };
    });

    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({ message: "Task rejected, funds returned to client", task: result.task });
  } catch (err) {
    console.error("admin reject error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;