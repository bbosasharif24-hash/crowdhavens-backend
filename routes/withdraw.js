const express = require("express");
const prisma = require("../prismaClient.js");

const router = express.Router();

const PLATFORM_FEE_RATE = 0.10;

function parseAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
}

// POST /api/client/withdraw
// Body: { userId, amount, destination? }
router.post("/", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const amt = parseAmount(amount);

    if (!userId || amt === null) {
      return res.status(400).json({ error: "Invalid request (missing userId or amount)" });
    }

    const fee = Number((amt * PLATFORM_FEE_RATE).toFixed(2));
    const payoutAmount = Number((amt - fee).toFixed(2));

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) return { error: "Wallet not found" };

      // Use unusedBalance field per schema; fallback to balance if legacy
      const unusedBalanceValue = Number(wallet.unusedBalance ?? wallet.balance ?? 0);

      if (unusedBalanceValue < amt) return { error: "Insufficient balance" };

      // Decrement client's unusedBalance by the full requested amount
      const updatedClientWallet = await tx.wallet.update({
        where: { userId },
        data: {
          unusedBalance: { decrement: String(amt) },
        },
      });

      // Create withdrawal transaction on client wallet (records requested amount and platformFee)
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "WITHDRAWAL",
          amount: String(amt),
          platformFee: String(fee),
        },
      });

      // Credit admin wallet with the fee (platform revenue)
      const adminUser = await tx.user.findFirst({ where: { role: "ADMIN" } });
      if (!adminUser) {
        throw new Error("Admin user not found. Seed an ADMIN user before using withdraw.");
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

      const updatedAdminWallet = await tx.wallet.update({
        where: { userId: adminUser.id },
        data: { unusedBalance: { increment: String(fee) } },
      });

      // Create fee transaction on admin wallet
      await tx.walletTransaction.create({
        data: {
          walletId: adminWallet.id,
          type: "FEE",
          amount: String(fee),
        },
      });

      // NOTE: Actual payout to user (sending money to bank/card) should be done by your payout provider.
      // This endpoint records the requested withdrawal and returns payoutAmount to be sent externally.

      return {
        clientWallet: updatedClientWallet,
        adminWallet: updatedAdminWallet,
        fee,
        payoutAmount,
        requestedAmount: amt,
      };
    });

    if (result.error) return res.status(400).json({ error: result.error });

    res.json({
      message: "Withdrawal request recorded",
      requestedAmount: result.requestedAmount,
      fee: result.fee,
      payoutAmount: result.payoutAmount,
      wallet: result.clientWallet,
    });
  } catch (err) {
    console.error("withdraw error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;