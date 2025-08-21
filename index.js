// index.js (CommonJS) — direct fetch first, ScrapingBee fallback if blocked
const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const BEE_KEY = process.env.SCRAPINGBEE_API_KEY || null;

app.get(["/", "/health"], (_req, res) => {
  res.json({ ok: true, service: "ocr", version: "alpha+meta+bee", time: new Date().toISOString() });
});

// ---------- helpers ----------
async function fetchHTML(url, opts = {}) {
  const { timeoutMs = 8000, maxBytes = 2_000_000, headers = {} } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const resp = await fetch(url, {
    signal: controller.signal,
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
      "accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      ...headers,
    },
  }).finally(() => clearTimeout(timer));

  if (!resp.ok) {
    const snippet = (await resp.text().catch(() => "")).slice(0, 300);
    const err = new Error(`Fetch failed ${resp.status} ${resp.statusText}`);
    err.httpStatus = resp.status;
    err.snippet = snippet;
    throw err;
  }

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
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchViaBee(url) {
  if (!BEE_KEY) {
    const e = new Error("ScrapingBee key not set");
    e.code = "NO_BEE_KEY";
    throw e;
  }
  const api = new URL("https://app.scrapingbee.com/api/v1");
  api.searchParams.set("api_key", BEE_KEY);
  api.searchParams.set("url", url);
  api.searchParams.set("render_js", "true"); // helps on dynamic pages

  const html = await fetchHTML(api.toString(), { timeoutMs: 12000 });
  return { html, source: "scrapingbee" };
}

function parseHTML(html) {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("#productTitle").text()?.trim() ||
    $("title").text()?.trim() ||
    null;

  const priceSel = [
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#corePrice_feature_div span.a-offscreen',
    '[data-a-color="price"] .a-offscreen',
    'span.a-price > span.a-offscreen',
    'meta[property="og:price:amount"]',
    'meta[name="price"]',
    'meta[itemprop="price"]'
  ];
  let price = null;
  for (const sel of priceSel) {
    const el = $(sel);
    if (!el.length) continue;
    const v = el.attr("content") || el.attr("content-value") || el.text();
    const cleaned = (v || "").trim();
    const m = cleaned.match(/(\$|£|€)?\s?([\d,.]+)(?!\s*\/)/);
    if (m) {
      price = { raw: cleaned, currency: m[1] || null, amount: m[2] || null };
      break;
    }
  }
  if (!price) {
    const bodyText = $("body").text();
    const m = bodyText.match(/(\$|£|€)\s?([\d]{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/);
    if (m) price = { raw: m[0], currency: m[1], amount: m[2] };
  }

  const image =
    $('meta[property="og:image"]').attr("content") ||
    $("#imgTagWrapperId img").attr("src") ||
    $('img[src^="https://"]').first().attr("src") ||
    null;

  return { title, price, image };
}
// --------------------------------

app.get("/meta", async (req, res) => {
  const raw = req.query.url;
  const debug = req.query.debug === "1";
  if (!raw) return res.status(400).json({ ok: false, error: "Missing ?url" });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid URL" });
  }
  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).json({ ok: false, error: "Only http(s) URLs allowed" });
  }

  let html, source = "direct";
  try {
    html = await fetchHTML(target.toString());
  } catch (e) {
    // Fallback to Bee on 403/429/other failures if key available
    if (BEE_KEY && (e.httpStatus === 403 || e.httpStatus === 429 || !e.httpStatus)) {
      try {
        const via = await fetchViaBee(target.toString());
        html = via.html;
        source = via.source;
      } catch (beeErr) {
        return res.status(502).json({
          ok: false,
          error: "Fetch failed (direct) and Bee fallback failed",
          detail: String(beeErr.message || beeErr),
          url: target.toString()
        });
      }
    } else {
      return res.status(502).json({
        ok: false,
        error: "Fetch failed",
        status: e.httpStatus || null,
        detail: e.message || String(e),
        url: target.toString()
      });
    }
  }

  const { title, price, image } = parseHTML(html);
  return res.json({
    ok: true,
    url: target.toString(),
    host: target.host,
    pathname: target.pathname,
    title: title || null,
    price: price || null,
    image: image || null,
    source,
    debug: debug ? { haveBeeKey: !!BEE_KEY } : undefined
  });
});

// JSON 404
app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const server = app.listen(PORT, HOST, () => console.log(`Server running on port ${PORT}`));

const shutdown = (sig) => {
  console.log(`Received ${sig}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (e) => console.error("Uncaught Exception:", e));
process.on("unhandledRejection", (r) => console.error("Unhandled Rejection:", r));
