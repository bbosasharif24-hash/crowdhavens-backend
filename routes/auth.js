const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prismaClient");
const verifyTurnstile = require("../utils/verifyTurnstile");

const router = express.Router();

/* ===============================
   CLIENT SIGNUP
   =============================== */
router.post("/signup/client", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Turnstile verification (skip in dev)
    if (process.env.NODE_ENV !== "production") {
      console.log("⚠️ Turnstile skipped (dev mode)");
    } else {
      const turnstileToken = req.body["cf-turnstile-response"];
      if (!turnstileToken) {
        return res.status(400).json({ error: "Missing bot verification" });
      }
      const isHuman = await verifyTurnstile(turnstileToken);
      if (!isHuman) return res.status(403).json({ error: "Robot detected" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user + wallet in one transaction
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "CLIENT",
        emailVerified: false,
        wallet: {
          create: {
            totalDeposited: 0,
            unusedBalance: 0,
            lockedFunds: 0,
          },
        },
      },
      include: { wallet: true },
    });

    res.json({
      success: true,
      userId: user.id,
      message: "Signup successful. Please verify your email.",
    });

  } catch (err) {
    console.error("Client signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* ===============================
   WORKER SIGNUP
   =============================== */
router.post("/signup/worker", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Turnstile verification (skip in dev)
    if (process.env.NODE_ENV !== "production") {
      console.log("⚠️ Turnstile skipped (dev mode)");
    } else {
      const turnstileToken = req.body["cf-turnstile-response"];
      if (!turnstileToken) return res.status(400).json({ error: "Missing bot verification" });
      const isHuman = await verifyTurnstile(turnstileToken);
      if (!isHuman) return res.status(403).json({ error: "Robot detected" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create worker user + wallet
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "WORKER",
        emailVerified: false,
        verificationStatus: "UNVERIFIED",
        wallet: {
          create: {
            totalDeposited: 0,
            unusedBalance: 0,
            lockedFunds: 0,
          },
        },
      },
      include: { wallet: true },
    });

    res.json({
      success: true,
      userId: user.id,
      message: "Worker account created. Please verify your email and complete your interview.",
    });

  } catch (err) {
    console.error("Worker signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* ===============================
   UNIVERSAL LOGIN
   =============================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });

    if (!user.emailVerified) return res.status(403).json({ error: "Email not verified. Please verify your email first." });

    res.json({
      success: true,
      user: { id: user.id, role: user.role },
      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
