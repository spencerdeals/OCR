// index.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.set("trust proxy", true);

// Simple health check
app.get(["/", "/health"], (_req, res) => {
  res.json({
    ok: true,
    service: "ocr",
    version: "alpha",
    time: new Date().toISOString(),
  });
});

// /meta?url=<encoded target URL>
app.get("/meta", async (req, res) => {
  try {
    const raw = req.query.url;
    if (!raw) {
      return res.status(400).json({ ok: false, error: "Missing ?url param" });
    }

    // Validate URL
    let target;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid URL" });
    }

    // Stub response (we can later fetch and parse if you want)
    return res.json({
      ok: true,
      received: raw,
      host: target.host,
      pathname: target.pathname,
      note: "meta stub — route is working",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

// 404 handler so unknown paths return JSON (not HTML)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
