// Instant Quote Backend (#alpha) — Full version with GET/POST /quote, debug routes, robust fetch
// Uses Node >=18 native fetch (no node-fetch). Optional ScrapingBee fallback via BEE_API_KEY.

const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------
// Health & debug
// ---------------------------
app.get(["/", "/health"], (_req, res) => {
  res.json({
    ok: true,
    service: "quote-scraper",
    version: "alpha-full-2025-08-21",
    time: new Date().toISOString(),
  });
});

app.get("/meta", (_req, res) => {
  res.json({
    ok: true,
    routes: ["/health", "/meta", "GET /quote?url=...", "POST /quote {url}", "/debug-index"],
    env: {
      NODE_ENV: process.env.NODE_ENV || "",
      PORT: process.env.PORT || "",
      BEE_API_KEY: process.env.BEE_API_KEY ? "set" : "not-set",
    },
  });
});

app.get("/debug-index", (_req, res) => {
  res.type("text/plain").send("Instant Quote backend is running. Version: alpha-full-2025-08-21");
});

// ---------------------------
// Utility: robust fetchHTML with timeout
// ---------------------------
async function fetchHTMLDirect(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (InstantQuoteBot)" },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// Optional: ScrapingBee fallback if BEE_API_KEY is provided
async function fetchHTMLViaBee(url, timeoutMs = 20000) {
  const key = process.env.BEE_API_KEY;
  if (!key) throw new Error("ScrapingBee key not set");
  const api = new URL("https://app.scrapingbee.com/api/v1/");
  api.searchParams.set("api_key", key);
  api.searchParams.set("url", url);
  api.searchParams.set("render_js", "false");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(api.toString(), { signal: controller.signal });
    if (!resp.ok) throw new Error(`Bee HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHTML(url) {
  try {
    return await fetchHTMLDirect(url, 15000);
  } catch (err) {
    // Try Bee only if configured
    if (process.env.BEE_API_KEY) {
      try {
        return await fetchHTMLViaBee(url, 20000);
      } catch (beeErr) {
        throw new Error(`Direct failed (${err.message}); Bee failed (${beeErr.message})`);
      }
    }
    throw err;
  }
}

// ---------------------------
// Utility: scrape metadata
// ---------------------------
function pullText($, selector) {
  const t = $(selector).first().text().trim();
  return t || "";
}

function pullAttr($, selector, attr) {
  const v = $(selector).first().attr(attr);
  return v || "";
}

function absolutize(baseUrl, maybe) {
  try {
    if (!maybe) return "";
    return new URL(maybe, baseUrl).toString();
  } catch {
    return maybe;
  }
}

async function scrapeMeta(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").first().text().trim() ||
    "";

  const priceRaw =
    $('meta[property="product:price:amount"]').attr("content") ||
    $('meta[itemprop="price"]').attr("content") ||
    $('[itemprop="price"]').attr("content") ||
    $('[class*="price"]').first().text().trim() ||
    "";

  const imageRaw =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $("img").first().attr("src") ||
    "";

  const image = absolutize(url, imageRaw);

  // Normalize price (best-effort)
  let price = "";
  if (priceRaw) {
    const match = (priceRaw.replace(/[, ]/g, "").match(/(\d+(\.\d{1,2})?)/) || [])[0];
    price = match || priceRaw;
  }

  return { ok: true, url, title, price, image };
}

// ---------------------------
// GET /quote?url=...
// ---------------------------
app.get("/quote", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ ok: false, error: "Missing url" });
    new URL(url); // validate
    const data = await scrapeMeta(url);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------
// POST /quote { url: "..." }
// ---------------------------
app.post("/quote", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: "Missing url" });
    new URL(url); // validate
    const data = await scrapeMeta(url);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------
// Start server
// ---------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
