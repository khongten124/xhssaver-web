const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  const targetUrl = req.query.url;
  const filename = req.query.filename || `xhs_media_${Date.now()}.jpg`;

  if (!targetUrl) {
    return res.status(400).send("Missing target url parameter");
  }

  try {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const proxyReq = lib.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.xiaohongshu.com/'
      }
    }, (proxyRes) => {
      res.setHeader("Content-Type", proxyRes.headers["content-type"] || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      res.status(500).send("Proxy error: " + e.message);
    });
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
};
