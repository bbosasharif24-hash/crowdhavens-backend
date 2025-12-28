const axios = require("axios");

module.exports = async (token) => {
  // 🔥 DEV MODE BYPASS
  if (process.env.TURNSTILE_BYPASS === "true") {
    console.warn("⚠️ Turnstile bypassed (DEV MODE)");
    return true;
  }

  // If token is missing
  if (!token) return false;

  try {
    const res = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token
      })
    );

    return res.data.success;
  } catch (err) {
    console.error("Turnstile verification error:", err.message);
    return false;
  }
};
