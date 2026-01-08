const axios = require("axios");

// Pseudo-code: replace with actual AirTM API integration
async function createAirTMPayment(userId, amount) {
  const payment = await axios.post(
    "https://api.airtm.com/payments",
    { account: process.env.AIRTM_ACCOUNT, amount, userId },
    { headers: { Authorization: `Bearer ${process.env.AIRTM_API_KEY}` } }
  );
  return payment.data.paymentUrl; // AirTM payment page URL
}

module.exports = { createAirTMPayment };
