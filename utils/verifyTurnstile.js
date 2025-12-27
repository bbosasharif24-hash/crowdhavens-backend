const axios = require("axios");

module.exports = async (token) => {
  const res = await axios.post(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token
    })
  );
  return res.data.success;
};
