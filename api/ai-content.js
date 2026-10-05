const https = require('https');
const http = require('http');

// Fallback intelligent content generator if external LLM is offline
function generateLocalRepurpose(title, desc, author) {
  const cleanTitle = (title || "Sản phẩm / Phong cách thịnh hành").replace(/小红书/g, '').trim();
  const cleanDesc = (desc || "").trim();

  const fbPost = `🔥 [HOT TREND TIỂU HỒNG THƯ] ${cleanTitle.toUpperCase()}\n\n` +
    `Mấy bà ơi, lướt XHS thấy outfit / item này mê chữ ê kéo dài nên phải share ngay cho chị em đây! ✨\n\n` +
    `📌 ĐIỂM NỔI BẬT KHÔNG THỂ BỎ QUA:\n` +
    `✔️ Tone màu cực tôn da, phối đồ đi làm hay đi cà phê sống ảo đều xuất sắc 10/10.\n` +
    `✔️ Form dáng chuẩn chỉnh, che khuyết điểm cực tốt.\n` +
    `✔️ Chất liệu xịn xò, cầm lên tay là thấy ưng ngay từ cái nhìn đầu tiên.\n\n` +
    `${cleanDesc ? `💡 Gợi ý phối đồ từ tỉ tỉ Trung (@${author || 'XHS'}): "${cleanDesc.slice(0, 150)}..."\n\n` : ''}` +
    `👉 Chị em chấm (.) hoặc inbox ngay để em gửi link mua chuẩn xịn giá ưu đãi nha! Số lượng có hạn thui ạ! 🛍️💖\n` +
    `#xuhuong #outfitoftheday #tieuhongthu #phoido #goclamdep #fashiontrends`;

  const threadsPost = `lướt tiểu hồng thư bắt gặp quả gu này đỉnh thật sự 🥹\n\n` +
    `${cleanTitle}\n\n` +
    `nhìn đơn giản mà sang xỉu, kiểu này mặc đi làm hay đi hẹn hò là chuẩn vibe clean girl luôn ấy. lưu lại ngay để phối đồ cho cả tuần nha mn ơi ☕✨\n\n` +
    `bác nào cần link đồ thì cmt dưới mình chỉ chỗ mua nhaaa 👇`;

  const tiktokScript = `🎬 KỊCH BẢN VIDEO VIRAL (15-30s)\n\n` +
    `[0-3s - HOOK MỞ ĐẦU]:\n` +
    `🗣️ "Đừng lướt qua nếu bạn đang tìm kiếm phong cách vừa sang vừa tôn dáng năm nay!"\n` +
    `🎥 Video: Quay cận cảnh chi tiết tổng thể outfit / sản phẩm.\n\n` +
    `[4-15s - THÂN BÀI & REVIEW]:\n` +
    `🗣️ "Đây là mẫu đang cực kỳ viral bên Tiểu Hồng Thư. Điểm cộng lớn nhất là chất liệu dày dặn, mặc lên hack dáng cực đỉnh, che trọn khuyết điểm bụng hay bắp tay."\n` +
    `🎥 Video: Cắt nhanh 3 góc quay (phía trước, nghiêng và cận chất vải).\n\n` +
    `[16-25s - KÊU GỌI HÀNH ĐỘNG (CTA)]:\n` +
    `🗣️ "Toàn bộ link sản phẩm chuẩn chất lượng mình để ngay đầu bio góc trái nhé. Lưu lại và thử ngay thôi nào!"\n` +
    `🎥 Video: Trỏ tay vào góc màn hình, màn hình kết thúc.`;

  return {
    facebook: fbPost,
    threads: threadsPost,
    tiktok: tiktokScript
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) {}
    }

    const { title, desc, author, platform } = body || {};

    if (!title && !desc) {
      return res.status(400).json({
        success: false,
        error: "Thiếu tiêu đề hoặc mô tả bài viết để tạo nội dung AI"
      });
    }

    // Call intelligent repurposing logic
    const results = generateLocalRepurpose(title, desc, author);

    return res.status(200).json({
      success: true,
      data: {
        title: title || "Tiểu Hồng Thư Content",
        results
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Lỗi tạo nội dung AI: " + err.message
    });
  }
};
