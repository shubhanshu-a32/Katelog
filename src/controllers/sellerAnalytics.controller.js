const Order = require("../models/Order");
const Product = require("../models/Product");
const mongoose = require("mongoose");

// SUMMARY CARDS: total revenue, total orders, total products
exports.getSalesSummary = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const productsCount = await Product.countDocuments({ sellerId: sellerId });

    const orders = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      { $match: { "product.sellerId": new mongoose.Types.ObjectId(sellerId) } }
    ]);

    const totalOrders = orders.length;

    let totalRevenue = 0;
    orders.forEach(o => {
      totalRevenue += o.items.price * o.items.quantity;
    });

    res.json({ totalOrders, totalRevenue, productsCount });
  } catch (err) {
    console.error("Seller summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// LINE GRAPH: sales per day
exports.getSalesGraph = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const results = await Order.aggregate([
      { $unwind: "$items" },

      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },

      // Ensure we match orders where the product belongs to this seller
      { $match: { "product.sellerId": new mongoose.Types.ObjectId(sellerId) } },

      // Group by date
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          revenue: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] }
          },
          orders: { $sum: 1 }
        }
      },

      { $sort: { "_id.date": 1 } }
    ]);

    const graph = results.map(r => ({
      date: r._id.date,
      revenue: r.revenue,
      orders: r.orders
    }));

    res.json(graph);
  } catch (err) {
    console.error("Seller graph error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// TOP PRODUCTS BAR GRAPH
exports.getTopProducts = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const results = await Order.aggregate([
      { $unwind: "$items" },

      // Join with products
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },

      { $match: { "product.sellerId": new mongoose.Types.ObjectId(sellerId) } },

      // Group by product title
      {
        $group: {
          _id: "$product.title",
          sold: { $sum: "$items.quantity" }
        }
      },

      { $sort: { sold: -1 } },
      { $limit: 5 }
    ]);

    res.json(results.map(r => ({ title: r._id, sold: r.sold })));
  } catch (err) {
    console.error("Top products error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// CATEGORY WISE SALES PIE CHART
exports.getCategorySales = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const results = await Order.aggregate([
      { $unwind: "$items" },

      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },

      { $match: { "product.sellerId": new mongoose.Types.ObjectId(sellerId) } },

      {
        $group: {
          _id: "$product.category",
          value: { $sum: "$items.quantity" } // or sum revenue if preferred
        }
      },
      // Resolve Category Details
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "catDetails"
        }
      },
      { $unwind: { path: "$catDetails", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          name: { $ifNull: ["$catDetails.title", "Unknown"] },
          value: 1
        }
      }
    ]);

    // Format results
    res.json(results);
  } catch (err) {
    console.error("Category sales error:", err);
    res.status(500).json({ message: "Server error" });
  }
};