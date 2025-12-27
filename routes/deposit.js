const express = require("express");
const prisma = require("../prismaClient.js");

const router = express.Router();

const PLATFORM_FEE_RATE = 0.10;

function parseAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
}

// POST /api/client/deposit
// Body: { userId, amount }
router.post("/", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const amt = parseAmount(amount);

    if (!userId || amt === null) {
      return res.status(400).json({ error: "Invalid request (missing userId or amount)" });
    }

    // Compute fee and net (2-decimal rounding)
    const fee = Number((amt * PLATFORM_FEE_RATE).toFixed(2));
    const netAmount = Number((amt - fee).toFixed(2));

    // Run as a single transaction to keep data consistent
    const result = await prisma.$transaction(async (tx) => {
      // Ensure client wallet exists (create if missing)
      let clientWallet = await tx.wallet.findUnique({ where: { userId } });
      if (!clientWallet) {
        clientWallet = await tx.wallet.create({
          data: {
            userId,
            totalDeposited: "0",
            unusedBalance: "0",
            lockedFunds: "0",
          },
        });
      }

      // Update client wallet: increment totalDeposited and unusedBalance by netAmount
      const updatedClientWallet = await tx.wallet.update({
        where: { userId },
        data: {
          totalDeposited: { increment: String(amt) },
          unusedBalance: { increment: String(netAmount) },
        },
      });

      // Record deposit transaction on client wallet
      await tx.walletTransaction.create({
        data: {
          walletId: clientWallet.id,
          type: "DEPOSIT",
          amount: String(amt),
          platformFee: String(fee),
        },
      });

      // Find the admin user (platform) and ensure admin wallet exists
      const adminUser = await tx.user.findFirst({ where: { role: "ADMIN" } });
      if (!adminUser) {
        throw new Error("Admin user not found. Seed an ADMIN user before using deposit.");
      }

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

      // Credit admin wallet with platform fee
      const updatedAdminWallet = await tx.wallet.update({
        where: { userId: adminUser.id },
        data: {
          unusedBalance: { increment: String(fee) },
        },
      });

      // Record fee transaction on admin wallet
      await tx.walletTransaction.create({
        data: {
          walletId: adminWallet.id,
          type: "FEE",
          amount: String(fee),
        },
      });

      return {
        clientWallet: updatedClientWallet,
        adminWallet: updatedAdminWallet,
        fee,
        netAmount,
        depositAmount: amt,
      };
    });

    res.json({
      message: "Deposit successful",
      depositAmount: result.depositAmount,
      fee: result.fee,
      netAmount: result.netAmount,
      wallet: result.clientWallet,
    });
  } catch (err) {
    console.error("deposit error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;