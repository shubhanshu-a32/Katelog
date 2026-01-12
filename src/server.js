require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const { connectDB } = require("./config/db");

// Routes (these files exist in your zip)
const authRoutes = require("./routes/auth.routes");
const categoryRoutes = require("./routes/category.routes");
const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");
const sellerProfileRoutes = require("./routes/sellerProfile.routes");
const buyerProfileRoutes = require("./routes/buyerProfile.routes");
const sellerAnalyticsRoutes = require("./routes/sellerAnalytics.routes");
const locationRoutes = require("./routes/location.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Health check BEFORE SPA fallback
app.get("/health", (_req, res) => res.json({ status: "OK" }));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

app.use("/api/seller/profile", sellerProfileRoutes);
app.use("/api/buyer/profile", buyerProfileRoutes);

app.use("/api/seller/analytics", sellerAnalyticsRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/admin", adminRoutes);

// React build
const clientBuildPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientBuildPath));

// ✅ Express 5 safe API-404 catcher (REPLACES app.all("/api/*"...))
app.all(/^\/api\/.*/, (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

// SPA fallback LAST
app.get("*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

async function start() {
  try {
    console.log("MONGODB_URI:", process.env.MONGODB_URI ? "SET" : "NOT SET");
    await connectDB(process.env.MONGODB_URI);

    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`🚀 Server running on ${port}`));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();