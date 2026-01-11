const prisma = require("../prismaClient");

/**
 * Middleware to attach the authenticated user to req.user
 * It checks the 'x-user-id' header first, then falls back to ?userId= query param.
 */
async function requireUser(req, res, next) {
  try {
    // 1. Try to get userId from Header
    let userId = req.headers["x-user-id"];

    // 2. Fallback: Try to get userId from Query Parameter (used in Admin fetchInterviews)
    if (!userId && req.query.userId) {
      userId = req.query.userId;
    }

    // 3. If still no ID, deny access
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: No user ID provided" });
    }

    // 4. Fetch User from Database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        verificationStatus: true,
        // Add other fields you might need globally here
      }
    });

    // 5. If user doesn't exist, deny access
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 6. Attach user to request object
    req.user = user;
    
    // 7. Continue to the next middleware/route
    next();

  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ error: "Internal authentication error" });
  }
}

module.exports = { requireUser };