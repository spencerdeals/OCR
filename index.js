// index.js (CommonJS)
const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Health on "/" and "/health"
app.get(["/", "/health"], (_req, res) => {
  res.json({
    ok: true,
    service: "ocr",
    version: "alpha+meta",
    time: new Date().toISOString(),
  });
});

// Helper: fetch with timeout + modest size cap
async function fetchHTML(url, { timeoutMs = 8000, maxBytes = 2_000_000 } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const resp = await fetch(url, {
    method: "GET",
    signal: controller.signal,
    redirect: "follow",
    headers: {
      // A very “normal” browser UA helps some e-commerce sites
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  }).catch((e) => {
    clearTimeout(id);
    throw e;
  });

  clearTimeout(id);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const snippet = text.slice(0, 300);
    throw new Error(`Fetch failed ${resp.status}: ${resp.statusText} :: ${snippet}`);
  }

  // Stream but cap size (basic guard)
  const reader = resp.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) break;
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  return buf.toString("utf8");
}

// Helper: best-effort price extraction
function findPrice($) {
  // Common Amazon spots
  const candidates = [
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#corePrice_feature_div span.a-offscreen',
    '[data-a-color="price"] .a-offscreen',
    'span.a-price > span.a-offscreen',
    'meta[property="og:price:amount"]',
    'meta[name="price"]',
    'meta[itemprop="price"]',
  ];

  for (const sel of candidates) {
    const el = $(sel);
    if (el.length) {
      const v =
        el.attr("content") ||
        el.attr("content-value") ||
        el.text();
      const cleaned = (v || "").trim();
      const m = cleaned.match(/(\$|£|€)?\s?([\d,.]+)(?!\s*\/)/);
      if (m) {
        return { raw: cleaned, currency: m[1] || null, amount: m[2] || null };
      }
    }
  }

  // Generic regex sweep on whole HTML text (last resort)
  const bodyText = $("body").text();
  const m = bodyText.match(/(\$|£|€)\s?([\d]{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/);
  if (m) {
    return { raw: m[0], currency: m[1], amount: m[2] };
  }
  return null;
}

function findTitle($) {
  // Try OG, then title tag, then common product title
  const og = $('meta[property="og:title"]').attr("content");
  if (og) return og.trim();
  const h1 = $("#productTitle").text();
  if (h1) return h1.trim();
  const t = $("title").text();
  if (t) return t.trim();
  return null;
}

function findImage($) {
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg) return ogImg;
  const main = $("#imgTagWrapperId img").attr("src");
  if (main) return main;
  // Generic first large-ish image
  const guess = $('img[src*="https://"]').first().attr("src");
  return guess || null;
}

// /meta — fetch and parse minimal details
app.get("/meta", async (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).json({ ok: false, error: "Missing ?url param" });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid URL" });
  }

  // Basic guardrails
  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).json({ ok: false, error: "Only http(s) URLs allowed" });
  }

  try {
    const html = await fetchHTML(target.toString());
    const $ = cheerio.load(html);

    const title = findTitle($);
    const price = findPrice($);
    const image = findImage($);

    return res.json({
      ok: true,
      url: target.toString(),
      host: target.host,
      pathname: target.pathname,
      title: title || null,
      price: price || null,
      image: image || null,
      note:
        "best-effort parse; some sites block bots — results may be null if blocked",
    });
  } catch (err) {
    // Don’t crash — return a helpful error
    return res.status(502).json({
      ok: false,
      error: "Fetch or parse failed",
      detail: String(err.message || err),
      url: target.toString(),
    });
  }
});

// JSON 404
app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = (sig) => {
  console.log(`Received ${sig}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (e) => console.error("Uncaught Exception:", e));
process.on("unhandledRejection", (r) => console.error("Unhandled Rejection:", r));
