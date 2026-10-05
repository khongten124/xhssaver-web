const crypto = require('crypto');

// Global registry shared in memory
if (!global.SEPAY_PAID_ORDERS) {
  global.SEPAY_PAID_ORDERS = new Map();
}

const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET || 'whsec_OrhTKj8cave4IDl5QJEdMPbaRZ10MpB3';

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "active", message: "XHSSaver SePay Webhook Endpoint" });
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch(e) {}
      }

      // SePay payload fields: { id, gateway, transactionDate, accountNumber, transferType, transferAmount, content, ... }
      const { content, transferAmount, transferType, id } = body || {};

      console.log(`[SePay Webhook] Received Tx ${id}: ${transferAmount} VND | Content: "${content}"`);

      if (!content) {
        return res.status(200).json({ success: true, message: "Ignored empty content" });
      }

      // Search for XHS order code (e.g., XHSA9K2)
      const match = content.match(/XHS[A-Z0-9]{4}/i);
      if (match) {
        const orderCode = match[0].toUpperCase();
        const amount = parseInt(transferAmount, 10) || 0;

        if (amount >= 40000) { // Accept 49k (with tolerance)
          global.SEPAY_PAID_ORDERS.set(orderCode, {
            orderCode,
            txId: id,
            amount,
            paidAt: new Date().toISOString()
          });
          console.log(`[SePay Webhook] Order ${orderCode} verified & marked PAID!`);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Webhook processed successfully"
      });

    } catch (e) {
      console.error("[SePay Webhook] Error:", e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
