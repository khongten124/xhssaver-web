const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'xhssaver_vip_secret_key_2026';

function generateVipKey(orderCode, days = 30) {
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = `${orderCode}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex').slice(0, 8).toUpperCase();
  const rawKey = `XHS-${signature.slice(0, 4)}-${signature.slice(4, 8)}-${Buffer.from(String(expiresAt)).toString('base64').replace(/=/g, '')}`;
  return {
    vipKey: rawKey,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

function verifyVipKeyWithDevice(keyStr, deviceId) {
  try {
    if (!keyStr || !keyStr.startsWith('XHS-')) return { valid: false, error: 'Mã VIP Key không đúng định dạng (XHS-XXXX-...)' };
    const parts = keyStr.split('-');
    if (parts.length < 4) return { valid: false, error: 'Mã VIP Key không hợp lệ' };
    
    const b64Exp = parts[3];
    let paddedB64 = b64Exp;
    while (paddedB64.length % 4 !== 0) paddedB64 += '=';
    const expStr = Buffer.from(paddedB64, 'base64').toString('utf-8');
    const expiresAt = parseInt(expStr, 10);
    
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, error: 'Mã VIP Key đã hết hạn sử dụng' };
    }

    if (!global.XHS_VIP_KEY_REGISTRY) {
      global.XHS_VIP_KEY_REGISTRY = new Map();
    }

    const now = Date.now();
    let reg = global.XHS_VIP_KEY_REGISTRY.get(keyStr);
    if (!reg) {
      reg = { devices: [], lockedUntil: 0 };
      global.XHS_VIP_KEY_REGISTRY.set(keyStr, reg);
    }

    if (reg.lockedUntil && now < reg.lockedUntil) {
      const hoursRemaining = Math.ceil((reg.lockedUntil - now) / (60 * 60 * 1000));
      return {
        valid: false,
        isLocked: true,
        error: `Mã VIP Key này đang bị TẠM KHÓA 72 GIỜ (còn ~${hoursRemaining}h) do phát hiện kích hoạt trên thiết bị thứ 3!`
      };
    }

    if (deviceId) {
      if (!reg.devices.includes(deviceId)) {
        if (reg.devices.length < 2) {
          reg.devices.push(deviceId);
        } else {
          reg.lockedUntil = now + 72 * 60 * 60 * 1000;
          return {
            valid: false,
            isLocked: true,
            error: 'CẢNH BÁO: Phát hiện thiết bị thứ 3 nhập mã. Hệ thống đã TỰ ĐỘNG KHÓA MÃ VIP 72 GIỜ trên toàn bộ thiết bị!'
          };
        }
      }
    }
    
    return {
      valid: true,
      expiresAt: new Date(expiresAt).toISOString(),
      daysLeft: Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
      deviceCount: reg.devices.length,
      maxDevices: 2,
      tier: 'XHS_VIP_PRO'
    };
  } catch (e) {
    return { valid: false, error: 'Mã VIP Key không hợp lệ hoặc bị lỗi' };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query || {};

  // 1. Create VietQR Order
  if (req.method === "POST" && action === "create") {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomStr = '';
    for (let i = 0; i < 4; i++) {
      randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const orderCode = `XHS${randomStr}`;
    const amount = 49000;
    const expireMinutes = 5;
    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();

    const bankBin = '970423';
    const bankAccount = '00004362479';
    const bankName = 'TPBank';
    const accountName = 'TONG DUC HONG ANH';
    const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-compact2.png?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(accountName)}`;

    return res.status(200).json({
      success: true,
      orderCode,
      amount,
      bankName,
      bankAccount,
      accountName,
      qrUrl,
      expiresAt,
      expireMinutes
    });
  }

  // 2. Verify VIP Key
  if (req.method === "POST" && action === "verify-key") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) {}
    }
    const { vipKey, deviceId } = body || {};
    const result = verifyVipKeyWithDevice(vipKey, deviceId);
    return res.status(200).json(result);
  }

  // 3. Claim Key via SePay
  if (req.method === "POST" && action === "claim-key") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) {}
    }
    const { orderCode } = body || {};
    if (!orderCode || !orderCode.toUpperCase().startsWith('XHS')) {
      return res.status(400).json({ success: false, error: 'Mã đơn hàng không hợp lệ' });
    }

    const cleanCode = orderCode.toUpperCase();
    if (global.SEPAY_PAID_ORDERS && global.SEPAY_PAID_ORDERS.has(cleanCode)) {
      const { vipKey, expiresAt } = generateVipKey(cleanCode, 30);
      return res.status(200).json({
        success: true,
        vipKey,
        expiresAt,
        message: 'Kích hoạt VIP Tiểu Hồng Thư 30 ngày thành công!'
      });
    }

    return res.status(200).json({
      success: false,
      waiting: true,
      error: 'Hệ thống đang kiểm tra biến động số dư TPBank. Nếu bạn vừa chuyển khoản, vui lòng đợi 5-10 giây rồi bấm lại!'
    });
  }

  return res.status(200).json({ status: "ok", endpoint: "/api/order" });
};
