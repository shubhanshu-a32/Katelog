require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { connectDB } = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const productRoutes = require('./routes/product.routes');
const orderRoutes = require('./routes/order.routes');
const sellerProfile = require('./routes/sellerProfile.routes');
const buyerProfile = require('./routes/buyerProfile.routes');

const app = express();
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Serve uploaded images (local disk fallback) from /uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const mongoUri = process.env.MONGODB_URI;

//Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/seller/profile', sellerProfile);
app.use('/api/buyer/profile', buyerProfile);
app.use("/api/seller/analytics", require('./routes/sellerAnalytics.routes'));
app.use("/api/location", require("./routes/location.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

// Serve Frontend (Hostinger/VPS Deployment)
const clientBuildPath = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientBuildPath));

// Catch-all invalid API routes before serving frontend
app.all(/^\/api\/.*/, (req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// SPA Fallback: Serve index.html for any non-API routes
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

//Health
app.get('/health', (_req, res) => res.json({ status: 'OK' }));

const start = async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`🚀 Server running on ${port}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();