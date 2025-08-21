// index.js
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get(["/", "/health"], (_req, res) => {
  res.json({ ok: true, version: "alpha", calc: "price-sum" });
});

// Quote endpoint (placeholder for your logic)
app.post("/quote", (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid request, items required" });
  }

  // Very basic calc — sum of (qty × price)
  const total = items.reduce((sum, item) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    return sum + qty * price;
  }, 0);

  res.json({
    ok: true,
    total,
    itemCount: items.length,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
