// index.js — backend with ScrapingBee integration
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors({ origin: true }));

// Your ScrapingBee API key
const SCRAPINGBEE_API_KEY = "QKV82QIFPXY7Y0KJ7X1565W2ZQIE9D3CDYD2TMBYF7OQP7S08SFZLNSSXKVCMOOSJIRY4HA79A81B33L";

// Health check
app.get(["/", "/health"], (_req, res) => {
  res.json({ ok: true, version: "alpha-scrapingbee" });
});

// Metadata fetch route
app.get("/meta", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ name: null, error: "Missing url" });

  try {
    const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(
      url
    )}&extract_rules={"title":"title","price":"meta[property='og:price:amount']@content"}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    res.json({
      name: data.title || null,
      price: data.price || null,
    });
  } catch (err) {
    console.error("ScrapingBee error:", err);
    res.status(500).json({ name: null, error: "Scraping failed" });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
