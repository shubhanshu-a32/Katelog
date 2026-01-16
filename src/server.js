// Force Restart v6
'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const dotenv = require('dotenv');

// Load .env safely (Hostinger sometimes runs with a different cwd)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config(); // also try default (process.cwd())

const connectDB = require('./config/db');

// ---- helpers ----
function pickFirstExistingBuildDir() {
  const candidates = [
    path.join(__dirname, '..', 'client', 'dist'), // ✅ your zip has this
    path.join(__dirname, '..', 'dist'),
    path.join(__dirname, '..', 'public'),
  ];

  for (const dir of candidates) {
    const indexFile = path.join(dir, 'index.html');
    if (fs.existsSync(indexFile)) return dir;
  }
  return null;
}

function getMongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URL ||
    process.env.DATABASE_URL ||
    ''
  );
}

// ---- app ----
const app = express();

// If you use cookies later, add credentials: true + proper origin.
// For now keep it simple.
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- health ----
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    status: 'UP',
    env: process.env.NODE_ENV || 'unknown',
    time: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    status: 'UP',
    env: process.env.NODE_ENV || 'unknown',
    time: new Date().toISOString(),
  });
});

// ---- API routes (adjust if your route file names differ) ----
// ---- API routes ----
try {
  const authRoutes = require("./routes/auth.routes");
  app.use("/api/auth", authRoutes);
  console.log("✅ Mounted: /api/auth");
} catch (e) { console.log("⚠️ auth.routes not loaded:", e.message); }

try {
  const categoryRoutes = require("./routes/category.routes");
  app.use("/api/categories", categoryRoutes);
  app.use("/api/variants", require("./routes/variant.routes")); // New Variant Routes
  console.log("✅ Mounted: /api/categories");
} catch (e) { console.log("⚠️ category.routes not loaded:", e.message); }

try {
  const productRoutes = require("./routes/product.routes");
  app.use("/api/products", productRoutes);
  console.log("✅ Mounted: /api/products");
} catch (e) { console.log("⚠️ product.routes not loaded:", e.message); }

try {
  const locationRoutes = require("./routes/location.routes");
  app.use("/api/location", locationRoutes);
  console.log("✅ Mounted: /api/location");
} catch (e) { console.log("⚠️ location.routes not loaded:", e.message); }

try {
  const sellerProfileRoutes = require("./routes/sellerProfile.routes");
  app.use("/api/seller/profile", sellerProfileRoutes);
  console.log("✅ Mounted: /api/seller/profile");
} catch (e) { console.log("⚠️ sellerProfile.routes not loaded:", e.message); }

try {
  const buyerProfileRoutes = require("./routes/buyerProfile.routes");
  app.use("/api/buyer/profile", buyerProfileRoutes);
  console.log("✅ Mounted: /api/buyer/profile");
} catch (e) { console.log("⚠️ buyerProfile.routes not loaded:", e.message); }

try {
  const orderRoutes = require("./routes/order.routes");
  app.use("/api/orders", orderRoutes);
  console.log("✅ Mounted: /api/orders");
} catch (e) { console.log("⚠️ order.routes not loaded:", e.message); }

try {
  const sellerAnalyticsRoutes = require("./routes/sellerAnalytics.routes");
  app.use("/api/seller/analytics", sellerAnalyticsRoutes);
  console.log("✅ Mounted: /api/seller/analytics");
} catch (e) { console.log("⚠️ sellerAnalytics.routes not loaded:", e.message); }

try {
  const adminRoutes = require("./routes/admin.routes");
  app.use("/api/admin", adminRoutes);
  console.log("✅ Mounted: /api/admin");
} catch (e) { console.log("⚠️ admin.routes not loaded:", e.message); }


// ---- Serve React build ----
const buildDir = pickFirstExistingBuildDir();

if (buildDir) {
  app.use(express.static(buildDir));

  // Optional: avoid favicon 404 noise if you don't have favicon in build
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  // SPA fallback (IMPORTANT): no "*" here (Express v5 path-to-regexp errors)
  // This serves index.html for everything EXCEPT /api/*
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });

  console.log('✅ Serving frontend from:', buildDir);
} else {
  console.log('⚠️ Frontend build not found. Upload React build folder (client/dist or dist).');
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  }
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// ---- start ----
async function start() {
  try {
    const mongoUri = getMongoUri();

    if (!mongoUri) {
      console.log('❌ Failed to start server: MONGO URI is missing.');
      console.log('➡️  Expected one of: MONGODB_URI / MONGO_URI / MONGODB_URL / DATABASE_URL');
      console.log(
        "➡️  Found env keys containing 'MONGO':",
        Object.keys(process.env).filter((k) => k.toUpperCase().includes('MONGO'))
      );
      throw new Error('MONGODB_URI is not set in environment variables (.env / Hostinger env).');
    }

    await connectDB(mongoUri);

    const port = Number(process.env.PORT || 4000);
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();