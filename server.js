// =====================================================
// 🔥 ENV MUST LOAD FIRST (ABSOLUTELY NOTHING ABOVE THIS)
// =====================================================
require("dotenv").config();

/* =====================================================
   DEBUG: ENV CHECK (REMOVE AFTER CONFIRM)
===================================================== */  
console.log("EMAIL_HOST =", process.env.EMAIL_HOST);
console.log("EMAIL_PORT =", process.env.EMAIL_PORT);
console.log("EMAIL_SECURE =", process.env.EMAIL_SECURE);
console.log("EMAIL_USER =", process.env.EMAIL_USER);
console.log("EMAIL_PASS length =", process.env.EMAIL_PASS?.length);

/* =====================================================
   IMPORTS (DECLARE ONCE — NO DUPLICATES)
===================================================== */
const express = require("express");
const cors = require("cors");
const prisma = require("./prismaClient");

/* =====================================================
   🔥 FORCE MAILER INIT AFTER ENV IS LOADED
===================================================== */
require("./utils/mailer");

/* =====================================================
   ROUTES
===================================================== */
const authRoutes = require("./routes/auth");
const otpRoutes = require("./routes/otp");
const interviewRoutes = require("./routes/interview");

/* 🔐 ADMIN INTERVIEW REVIEW (PRIVATE) */
const interviewReviewRoutes = require("./routes/interviewReview.routes");
const adminInterviewOnly = require("./middleware/adminInterviewOnly");

/* =====================================================
   CLIENT ROUTES
===================================================== */
const depositRoutes = require("./routes/deposit");
const withdrawRoutes = require("./routes/withdraw");
const taskRoutes = require("./routes/task");
const adminTaskRoutes = require("./routes/adminTask");

/* =====================================================
   APP INIT
===================================================== */
const app = express(); // ✅ must be declared BEFORE any app.use()

/* =====================================================
   CORS CONFIG (FRONTEND SAFE)
===================================================== */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow Postman, curl, etc.
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.error("❌ CORS blocked:", origin);
      return callback(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

/* =====================================================
   BODY PARSERS
===================================================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   ROUTES
===================================================== */

// Admin task routes
app.use("/api/admin/task", adminTaskRoutes);

// Public / Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/interview", interviewRoutes);

// Admin interview review
app.use(
  "/api/interview-review",
  adminInterviewOnly,
  interviewReviewRoutes
);

// Client routes
app.use("/api/client/deposit", depositRoutes);
app.use("/api/client/withdraw", withdrawRoutes);
app.use("/api/client/task", taskRoutes);

/* =====================================================
   HEALTH ROUTES
===================================================== */
app.get("/", (req, res) => res.send("✅ CrowdHavens backend is running"));

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
  console.error("🔥 Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* =====================================================
   SERVER START
===================================================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ CrowdHavens backend running on port ${PORT}`);
});
