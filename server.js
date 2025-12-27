// =====================================================
// 🔥 ENV MUST LOAD FIRST (ABSOLUTELY NOTHING ABOVE THIS)
// =====================================================
require("dotenv").config();

/* =====================================================
   DEBUG: ENV CHECK (REMOVE AFTER CONFIRM)
===================================================== */  
console.log("POSTMARK_API_KEY =", process.env.POSTMARK_API_KEY?.slice(0, 5) + "****"); // partial mask for safety

/* =====================================================
   IMPORTS (DECLARE ONCE — NO DUPLICATES)
===================================================== */
const express = require("express");
const cors = require("cors");
const prisma = require("./prismaClient");
const { Client } = require("postmark"); // Postmark client

/* =====================================================
   🔥 POSTMARK MAILER INIT
===================================================== */
if (!process.env.POSTMARK_API_KEY) {
  console.error("❌ Missing POSTMARK_API_KEY in environment variables.");
  process.exit(1);
}

const mailer = new Client(process.env.POSTMARK_API_KEY);
console.log("📧 Postmark client initialized");

/**
 * Send OTP email function
 * @param {string} to - recipient email
 * @param {string} code - OTP code
 */
async function sendOtpEmail(to, code) {
  try {
    await mailer.sendEmail({
      From: process.env.POSTMARK_SENDER_EMAIL,
      To: to,
      Subject: "Your CrowdHavens OTP Code",
      TextBody: `Your OTP code is: ${code}. It expires in 10 minutes.`,
      HtmlBody: `<strong>Your OTP code is:</strong> ${code}<br/>It expires in 10 minutes.`,
    });
    console.log(`✅ OTP email sent to ${to}`);
  } catch (err) {
    console.error("❌ Failed to send OTP email:", err);
    throw err;
  }
}

// Make mailer available to routes
require("./utils/mailer")(sendOtpEmail);

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
