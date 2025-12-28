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

/* =====================================================
   ROUTES
===================================================== */
const authRoutes = require("./routes/auth");
const otpRoutes = require("./routes/otp");
const interviewRoutes = require("./routes/interview");
const interviewReviewRoutes = require("./routes/interviewReview.routes");
const adminInterviewOnly = require("./middleware/adminInterviewOnly");
const depositRoutes = require("./routes/deposit");
const withdrawRoutes = require("./routes/withdraw");
const taskRoutes = require("./routes/task");
const adminTaskRoutes = require("./routes/adminTask");

/* =====================================================
   APP INIT
===================================================== */
const app = express();

/* =====================================================
   CORS CONFIG (🔥 FIXED)
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
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // 🔥 THIS FIXES PREFLIGHT

/* =====================================================
   BODY PARSERS
===================================================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   API ROUTES
===================================================== */
app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/interview", interviewRoutes);

app.use(
  "/api/interview-review",
  adminInterviewOnly,
  interviewReviewRoutes
);

app.use("/api/admin/task", adminTaskRoutes);
app.use("/api/client/deposit", depositRoutes);
app.use("/api/client/withdraw", withdrawRoutes);
app.use("/api/client/task", taskRoutes);

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
   GLOBAL ERROR HANDLER (🔥 SAFE)
===================================================== */
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled error:", err.message);

  res.status(500).json({
    error: "Internal server error",
  });
});

/* =====================================================
   SERVER START
===================================================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ CrowdHavens backend running on port ${PORT}`);
});
