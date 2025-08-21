const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------
// Health check
// ---------------------------
app.get(["/", "/health"], (_req, res) => {
  res.json({
    ok: true,
    service: "quote-scraper",
    version: "alpha",
    time: new Date().toISOString(),
  });
});

// ---------------------------
// Utility: fetch HTML
// ---------------------------
async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (InstantQuoteBot)" },
    timeout: 15000,
  });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return await response.text();
}

// ---------------------------
// Utility: scrape metadata
// ---------------------------
async function scrapeMeta(url) {
  try {
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text() ||
      "";

    const price =
      $('meta[property="product:price:amount"]').attr("content") ||
      $('[itemprop="price"]').attr("content") ||
      $('[class*="price"]').first().text().trim() ||
      "";

    const image =
      $('meta[property="og:image"]').attr("content") ||
      $("img").first().attr("src") ||
      "";

    return { ok: true, url, title, price, image };
  } catch (err) {
    return { ok: false, url, error: err.message };
  }
}

// ---------------------------
// GET /quote?url=...
// ---------------------------
app.get("/quote", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  const data = await scrapeMeta(url);
  res.json(data);
});

// ---------------------------
// POST /quote { url: "..." }
// ---------------------------
app.post("/quote", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  const data = await scrapeMeta(url);
  res.json(data);
});

// ---------------------------
// Start server
// ---------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
