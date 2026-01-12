const prisma = require("../prismaClient");

/**
 * Middleware to attach the authenticated user to req.user.
 * It checks the 'x-user-id' header (Secure) first.
 * FALLBACK: It checks 'userId' query param (Use with caution!).
 */
async function requireUser(req, res, next) {
  try {
    // 1. Priority: Check Header (Secure)
    let userId = req.headers["x-user-id"];

    // 2. Fallback: Check Query Param (For Read-Only operations only, ideally)
    // Note: Be careful allowing query params for POST/PUT requests as it's insecure.
    if (!userId && req.query.userId) {
      // ⚠️ SECURITY WARNING: Only allow query param for GET requests usually.
      // For now, we keep it to match your current frontend logic.
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
        role: true, // CRITICAL: We need the role!
        fullName: true,
        verificationStatus: true,
        balance: true, // Helpful to have immediately available
      }
    });

    // 5. If user doesn't exist, deny access
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 6. Attach user to request object
    req.user = user;
    
    // 7. Continue
    next();

  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ error: "Internal authentication error" });
  }
}

/**
 * Role Guard: Only allows WORKERS
 */
function requireWorker(req, res, next) {
  if (req.user.role !== "WORKER") {
    return res.status(403).json({ error: "Forbidden: Workers only" });
  }
  next();
}

/**
 * Role Guard: Only allows CLIENTS
 */
function requireClient(req, res, next) {
  if (req.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Forbidden: Clients only" });
  }
  next();
}

/**
 * Role Guard: Only allows ADMINS
 */
function requireAdmin(req, res, next) {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  next();
}

module.exports = { 
  requireUser, 
  requireWorker, 
  requireClient, 
  requireAdmin 
};