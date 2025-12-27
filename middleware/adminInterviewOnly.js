// middleware/adminInterviewOnly.js

const prisma = require("../prismaClient");

/**
 * ADMIN INTERVIEW REVIEW ONLY
 * - role must be ADMIN
 * - email must be whitelisted
 * - uses userId (NO auth rewrite)
 */
const ALLOWED_ADMIN_EMAILS = [
  "director@crowdhavens.com",
  "admin1@crowdhavens.com",
  "admin3@crowdhavens.com"
];

module.exports = async function adminInterviewOnly(req, res, next) {
  try {
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true }
    });

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admins only" });
    }

    if (!ALLOWED_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return res.status(403).json({ error: "Admin email not allowed" });
    }

    next();
  } catch (err) {
    console.error("❌ ADMIN INTERVIEW GUARD ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
};
