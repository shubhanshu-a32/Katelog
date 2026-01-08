const Order = require("../models/Order");
const Product = require("../models/Product");
const SellerAnalytics = require("../models/SellerAnalytics");
const { paginate } = require("../utils/pagination");
const { generateInvoice } = require('../utils/invoice');

/* ---------------- SHIPPING LOGIC ---------------- */
const calcShipping = (itemCount, total) => {
  // 1. Single product
  if (itemCount === 1) {
    if (total > 2000) return 0; // Rule 4
    if (total < 500) return 80; // Rule 1
    return 100; // Rule 5 (500 <= total <= 2000)
  }

  // Multiple products
  if (total > 2000) {
    if (itemCount >= 5) return 0; // Rule 2
    return 100; // Rule 3 (count < 5)
  }

  // Fallback for multiple items <= 2000
  return 100;
};

/* ---------------- CREATE ORDER ---------------- */
const createOrder = async (req, res) => {
  try {
    const buyer = req.user._id;
    // Accept both paymentMode and paymentType (frontend uses paymentType)
    const paymentMode = req.body.paymentMode || req.body.paymentType || "COD";
    const { items, address } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items required" });
    }

    let totalAmount = 0;
    let platformCommission = 0;
    let seller = null;

    const orderItems = [];

    for (const it of items) {
      const prodId = it.product || it.productId;
      const qty = it.quantity || it.qty;

      const product = await Product.findById(prodId);

      if (!product) {
        return res.status(400).json({ message: "Product not found" });
      }

      if (product.stock < qty) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.title}`,
        });
      }

      if (!seller) seller = product.sellerId;
      if (seller.toString() !== product.sellerId.toString()) {
        return res
          .status(400)
          .json({ message: "Multiple sellers in one order not allowed" });
      }

      totalAmount += product.price * qty;

      const commissionPercent = product.commission || 0;
      platformCommission += (product.price * qty * commissionPercent) / 100;

      orderItems.push({
        product: product._id,
        quantity: qty,
        price: product.price,
        commission: commissionPercent
      });
    }

    const shippingCharge = calcShipping(orderItems.length, totalAmount);
    const finalTotal = totalAmount + shippingCharge;

    const order = await Order.create({
      buyer,
      sellerId: seller,
      items: orderItems,
      totalAmount: finalTotal,
      shippingCharge,
      paymentMode,
      paymentStatus: paymentMode === "COD" ? "PENDING" : "PAID",
      orderStatus: "PLACED",
      address,
    });

    // Reduce stock AFTER order success
    // Calculate Total Commission Percentage (Sum of all item commissions)
    let totalCommissionPercentage = 0;
    for (const it of orderItems) {
      await Product.findByIdAndUpdate(it.product, {
        $inc: { stock: -it.quantity },
      });
      totalCommissionPercentage += (it.commission || 0);
    }

    // Calculate Earnings
    const deliveryPartnerFee = shippingCharge * 0.8;
    // sellerEarning = Total Order Amount (Inc. Shipping) - Commission - Shipping Charge
    // This effectively results in (Product Price - Commission) but follows the user's requested formula structure.
    const sellerEarning = finalTotal - platformCommission - shippingCharge;

    await SellerAnalytics.create({
      orderId: order._id,
      platformCommission,
      totalCommissionPercentage,
      sellerEarning,
      deliveryPartnerFee,
      sellerId: seller,
    });


    res.status(201).json(order);
  } catch (err) {
    console.error("createOrder error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ------------------ DOWNLOAD INVOICE ----------------------*/

const downloadInvoice = async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("items.product")
    .populate("sellerId", "shopName address mobile email ownerName lat lng");

  if (!order) return res.status(404).json({ message: "Order not found" });

  generateInvoice(order, res);
}

/* ---------------- LIST ORDERS ---------------- */
const listOrdersByUser = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 10 } = req.query;

    console.log("listOrdersByUser HIT. User:", user._id, "Role:", user.role);

    const filter =
      user.role === "buyer"
        ? { buyer: user._id }
        : { "items.product": { $exists: true } };

    const query = Order.find(filter)
      .sort({ createdAt: -1 })
      .populate("items.product")
      .populate("buyer", "fullName mobile email addresses");

    const result = await paginate(query, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    console.error("listOrders error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET SELLER ORDERS (SECURE) ---------------- */
const getOrdersBySeller = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    console.log("getOrdersBySeller HIT. Seller:", sellerId);

    const query = Order.find({ sellerId })
      .sort({ createdAt: -1 })
      .populate("items.product")
      .populate("buyer", "fullName mobile email addresses");

    const result = await paginate(query, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    console.error("getOrdersBySeller error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET ORDER STATS ---------------- */
const getOrderStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const stats = await Order.aggregate([
      { $match: { buyer: userId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
        },
      },
    ]);

    if (stats.length === 0) {
      return res.json({ totalOrders: 0, totalSpent: 0 });
    }

    res.json(stats[0]);
  } catch (err) {
    console.error("getOrderStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- UPDATE STATUS ---------------- */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role === "seller") {
      order.orderStatus = status;
      await order.save();
      return res.json(order);
    }

    if (
      req.user.role === "buyer" &&
      status === "CANCELLED" &&
      order.orderStatus === "PLACED"
    ) {
      order.orderStatus = "CANCELLED";
      await order.save();
      return res.json(order);
    }

    res.status(403).json({ message: "Not authorized" });
  } catch (err) {
    console.error("updateOrderStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createOrder,
  listOrdersByUser,
  updateOrderStatus,
  downloadInvoice,
  getOrderStats,
  getOrdersBySeller,
};
