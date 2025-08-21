// index.js (CommonJS)
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Health on "/" and "/health"
app.get(["/", "/health"], (_req, res) => {
  res.json({
    ok: true,
    service: "ocr",
    version: "alpha",
    time: new Date().toISOString(),
  });
});

// Simple /meta stub
app.get("/meta", (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).json({ ok: false, error: "Missing ?url param" });
  try {
    const u = new URL(raw);
    res.json({
      ok: true,
      received: raw,
      host: u.host,
      pathname: u.pathname,
      note: "meta stub — route is working"
    });
  } catch {
    res.status(400).json({ ok: false, error: "Invalid URL" });
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
