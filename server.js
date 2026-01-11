console.log("TURNSTILE_BYPASS =", process.env.TURNSTILE_BYPASS);

// =====================================================
// 🔥 ENV MUST LOAD FIRST
// =====================================================
require("dotenv").config();

/* =====================================================
   IMPORTS
===================================================== */
const express = require("express");
const cors = require("cors");
const prisma = require("./prismaClient");

// OLD ROUTES (Auth & Interviews - Keep these)
const authRoutes = require("./routes/auth");
const otpRoutes = require("./routes/otp");
const interviewRoutes = require("./routes/interview");
const interviewReviewRoutes = require("./routes/interviewReview.routes");
const adminInterviewOnly = require("./middleware/adminInterviewOnly");

// OLD ROUTES (Specific features - Keep these for now)
const verificationRoutes = require("./routes/verification.routes");
const depositRoutes = require("./routes/deposit");

// =====================================================
// NEW UNIFIED ROUTES
// =====================================================
const clientRoutes = require("./routes/client.routes");
const workerRoutes = require("./routes/worker.routes");
const adminRoutes = require("./routes/admin.routes");

/* =====================================================
   APP INIT
===================================================== */
const app = express();

/* =====================================================
   CORS CONFIG
===================================================== */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://crowdhavens-frontend.vercel.app",
  "https://crowdhavens.com",
  "https://www.crowdhavens.com",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.error("❌ CORS blocked:", origin);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =====================================================
   BODY PARSERS
===================================================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   API ROUTES
===================================================== */

// 1. Authentication & Interviews (Existing)
app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/interview", interviewRoutes);

app.use(
  "/api/interview-review",
  adminInterviewOnly,
  interviewReviewRoutes
);

// 2. Specific Legacy Features (Kept for now)
// Verification (User submits $1 request) & Deposit (Client submits funds)
app.use("/api/verification", verificationRoutes);
app.use("/api/client/deposit", depositRoutes);

// 3. NEW UNIFIED ROUTES
// Client Dashboard (Balance, Tasks, Create Task)
app.use("/api/client", clientRoutes);

// Worker Dashboard (Available Tasks, Submit Task, Profile, Withdraw)
app.use("/api/tasks", workerRoutes);
app.use("/api/user", workerRoutes);
app.use("/api/client/withdraw", workerRoutes);

// Admin Dashboard (Stats, Reviews, Approvals)
app.use("/api/admin", adminRoutes);

/* =====================================================
   HEALTH CHECKS
===================================================== */
app.get("/", (req, res) => {
  res.send("✅ CrowdHavens backend is running");
});

app.get("/__health/db", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ db: "connected" });
  } catch (err) {
    console.error("❌ DB health error:", err);
    res.status(500).json({ db: "error" });
  }
});

/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled error:", err.message);
  res.status(500).json({
    error: "Internal server error",
  });
});

/* =====================================================
   404 NOT FOUND HANDLER
===================================================== */
app.use((req, res, next) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl
  });
});

/* =====================================================
   SERVER START
===================================================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ CrowdHavens backend running on port ${PORT}`);
});