// OCR Service — Step 1 baseline (CommonJS)
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: "*"}));
app.use(express.json({ limit: "2mb" }));

app.get(["/", "/health"], (_req, res) => {
  res.json({
    ok: true,
    service: "ocr",
    version: "1.0.0-step1",
    time: new Date().toISOString(),
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || null
  });
});

// Stub endpoint for now — we'll wire real extraction in Step 2
app.post("/extract", async (req, res) => {
  const { url } = req.body || {};
  res.json({
    ok: true,
    receivedUrl: url || null,
    status: "stub",
    note: "Extractor will be implemented in Step 2"
  });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`[ocr] service up on :${PORT}`);
});
