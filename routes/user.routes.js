const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

// Simple Auth Middleware (Assuming you have one or create a basic one)
// If you have an existing middleware file (like 'middleware/auth'), use it instead.
const checkAuth = (req, res, next) => {
  const userId = req.headers["x-user-id"]; // Frontend must send this header
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId; // Attach to request
  next();
};

// ✅ UPDATE PROFILE
router.put("/profile", checkAuth, async (req, res) => {
  try {
    const { fullName, telephone, country, place, paymentEmail } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: {
        fullName: fullName || undefined,
        telephone: telephone || undefined,
        country: country || undefined,
        place: place || undefined,
        paymentEmail: paymentEmail || undefined
      }
    });

    res.json({ message: "Profile updated successfully", user: updatedUser });

  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;