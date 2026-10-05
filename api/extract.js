const https = require('https');
const http = require('http');
const { URL } = require('url');

function fetchWithTimeout(targetUrl, options = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(targetUrl, {
      ...options,
      timeout: timeoutMs
    }, (res) => {
      // Handle HTTP redirects (301, 302, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).toString();
        }
        return fetchWithTimeout(redirectUrl, options, timeoutMs).then(resolve).catch(reject);
      }

      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          url: res.responseUrl || targetUrl,
          body
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function cleanXhsUrl(raw) {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/(www\.)?(xiaohongshu\.com|xhslink\.com)\/[a-zA-Z0-9_\-\/?=&%#]+/i);
  return match ? match[0] : null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch(e) {}
    }
    const rawUrl = (body && body.url) || req.query.url;
    const targetUrl = cleanXhsUrl(rawUrl);

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng dán đường link bài viết Xiaohongshu hợp lệ (Ví dụ: xhslink.com/... hoặc xiaohongshu.com/...)"
      });
    }

    // 1. Resolve redirect to get canonical URL and HTML
    const pageResp = await fetchWithTimeout(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,vi;q=0.7'
      }
    }, 9000);

    const html = pageResp.body || "";
    let extractedData = null;

    // 2. Extract window.__INITIAL_STATE__
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?})<\/script>/s) ||
                       html.match(/window\.__INITIAL_SSR_STATE__\s*=\s*({.+?})<\/script>/s);

    if (stateMatch && stateMatch[1]) {
      try {
        const stateStr = stateMatch[1].replace(/undefined/g, 'null');
        const stateObj = JSON.parse(stateStr);
        const noteData = stateObj.noteData || stateObj.note || {};
        const note = noteData.data?.noteDetailMap ? Object.values(noteData.data.noteDetailMap)[0]?.note : (noteData.data?.note || noteData.note);
        
        if (note) {
          const isVideo = note.type === 'video' || !!note.video;
          const imageList = (note.imageList || []).map(img => {
            // Get highest resolution 4K CDN image URL without watermark
            let cdnUrl = img.urlDefault || img.urlPre || img.url;
            if (img.infoList && img.infoList.length > 0) {
              const best = img.infoList.find(i => i.imageScene === 'WB_ORIGIN') || img.infoList[img.infoList.length - 1];
              if (best && best.url) cdnUrl = best.url;
            }
            if (cdnUrl && cdnUrl.startsWith('http://')) cdnUrl = cdnUrl.replace('http://', 'https://');
            return cdnUrl;
          }).filter(Boolean);

          let videoUrl = null;
          if (isVideo && note.video) {
            const media = note.video.media || {};
            const stream = media.stream || {};
            videoUrl = stream.h264?.[0]?.masterUrl || stream.h265?.[0]?.masterUrl || note.video.url;
          }

          extractedData = {
            id: note.noteId || note.id || String(Date.now()),
            title: note.title || "Bộ ảnh Tiểu Hồng Thư HD",
            desc: note.desc || "",
            type: isVideo ? "video" : "image",
            author: note.user?.nickname || "Creator XHS",
            avatar: note.user?.avatar || null,
            images: imageList,
            videoUrl: videoUrl,
            cover: note.cover?.urlDefault || (imageList.length > 0 ? imageList[0] : null)
          };
        }
      } catch (err) {
        console.error("State parse err:", err);
      }
    }

    // Fallback: Regex extraction for og meta tags if state is obfuscated
    if (!extractedData) {
      const ogTitle = (html.match(/<meta\s+name="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i))?.[1] || "Bộ ảnh Xiaohongshu 4K";
      const ogImage = (html.match(/<meta\s+name="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i))?.[1];
      const imgMatches = [...html.matchAll(/https:\/\/sns-img-[a-z0-9]+\.xhscdn\.com\/[a-zA-Z0-9_\-\/]+/g)].map(m => m[0]);
      const uniqueImages = [...new Set(imgMatches)].filter(u => !u.includes('avatar') && !u.includes('icon'));

      if (uniqueImages.length > 0 || ogImage) {
        const finalImages = uniqueImages.length > 0 ? uniqueImages : [ogImage];
        extractedData = {
          id: String(Date.now()),
          title: ogTitle.replace(/ - 小红书.*$/, '').trim(),
          desc: "",
          type: "image",
          author: "Creator XHS",
          images: finalImages,
          videoUrl: null,
          cover: finalImages[0]
        };
      }
    }

    if (!extractedData || (extractedData.images.length === 0 && !extractedData.videoUrl)) {
      return res.status(404).json({
        success: false,
        error: "Không thể trích xuất nội dung bài viết này. Có thể bài viết bị xóa hoặc đặt ở chế độ riêng tư."
      });
    }

    return res.status(200).json({
      success: true,
      data: extractedData
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Lỗi hệ thống khi bóc tách Xiaohongshu: " + error.message
    });
  }
};
