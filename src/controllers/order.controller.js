const Order = require("../models/Order");
const Product = require("../models/Product");
const SellerAnalytics = require("../models/SellerAnalytics");
const { paginate } = require("../utils/pagination");
const { generateInvoice } = require('../utils/invoice');
const Offer = require("../models/Offer");

/* ---------------- SHIPPING LOGIC ---------------- */
const calcShipping = (itemCount, total) => {
  // Free Shipping (User Request - "Make the shipping logic comment out")
  return 0;

  /*
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
  */
};

/* ---------------- CREATE ORDER ---------------- */
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

    // 1. Group items by Seller
    const sellerGroups = {};

    console.log("CreateOrder Items:", items);

    for (const it of items) {
      const prodId = it.product || it.productId;
      const qty = it.quantity || it.qty;

      const product = await Product.findById(prodId);

      if (!product) {
        console.error("Product not found:", prodId);
        return res.status(400).json({
          message: "One or more items in your cart is no longer available.",
          invalidProductId: prodId,
          errorType: "PRODUCT_NOT_FOUND"
        });
      }

      if (product.stock < qty) {
        console.error("Insufficient stock:", product.title, product.stock, qty);
        return res.status(400).json({
          message: `Insufficient stock for ${product.title}`,
          invalidProductId: prodId,
          errorType: "INSUFFICIENT_STOCK",
          availableStock: product.stock
        });
      }

      const sellerIdStr = product.sellerId.toString();
      if (!sellerGroups[sellerIdStr]) {
        sellerGroups[sellerIdStr] = {
          sellerId: product.sellerId,
          items: [],
          totalAmount: 0,
          platformCommission: 0,
        };
      }

      const commissionPercent = product.commission || 0;
      const amount = product.price * qty;
      const commission = (amount * commissionPercent) / 100;

      sellerGroups[sellerIdStr].items.push({
        product: product._id,
        quantity: qty,
        price: product.price,
        commission: commissionPercent,
        category: product.category // Store category for discount logic
      });

      sellerGroups[sellerIdStr].totalAmount += amount;
      sellerGroups[sellerIdStr].platformCommission += commission;
    }

    const createdOrders = [];

    // 1.5 Calculate Global Total for Proportional Discount (Eligible Amount Only)
    // Fetch coupon to check categories
    const { couponCode, discount } = req.body;
    let applicableCategories = [];
    let offer = null;

    if (couponCode) {
      offer = await Offer.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (offer) {
        // Usage limit check removed as per user request

        applicableCategories = offer.applicableCategories || [];
      }
    }

    let globalEligibleAmount = 0;
    const sellerEligibleTotals = {};

    // Calculate eligible totals per seller
    for (const sellerId in sellerGroups) {
      let groupEligibleTotal = 0;
      sellerGroups[sellerId].items.forEach(item => {
        if (!applicableCategories.length) {
          // No restrictions = all items eligible
          groupEligibleTotal += (item.price * item.quantity);
        } else {
          // Check if item category matches coupon categories
          if (item.category && applicableCategories.some(cat => cat.toString() === item.category.toString())) {
            groupEligibleTotal += (item.price * item.quantity);
          }
        }
      });
      sellerEligibleTotals[sellerId] = groupEligibleTotal;
      globalEligibleAmount += groupEligibleTotal;
    }

    const totalDiscountToApply = Number(discount) || 0;

    for (const sellerId in sellerGroups) {
      const group = sellerGroups[sellerId];

      const shippingCharge = calcShipping(group.items.length, group.totalAmount);

      // Proportional Discount Calculation STRICTLY based on Eligible Amount
      let orderDiscount = 0;
      if (totalDiscountToApply > 0 && globalEligibleAmount > 0) {
        const eligibleAmt = sellerEligibleTotals[sellerId] || 0;
        if (eligibleAmt > 0) {
          const ratio = eligibleAmt / globalEligibleAmount;
          orderDiscount = Math.floor(totalDiscountToApply * ratio);
        }
      }

      // Ensure discount doesn't exceed total
      const totalBeforeDiscount = group.totalAmount + shippingCharge;
      orderDiscount = Math.min(orderDiscount, totalBeforeDiscount);

      const finalTotal = totalBeforeDiscount - orderDiscount;

      let discountRemark = null;
      if (orderDiscount > 0 && offer) {
        discountRemark = `Coupon ${offer.code} applied.`;
      }

      const order = await Order.create({
        buyer,
        sellerId: group.sellerId,
        items: group.items,
        totalAmount: finalTotal,
        shippingCharge,
        couponCode: orderDiscount > 0 ? (couponCode || null) : null, // Only save coupon if discount applied
        discountAmount: orderDiscount,
        discountRemark,
        paymentMode,
        paymentStatus: paymentMode === "COD" ? "PENDING" : "PAID",
        orderStatus: "PLACED",
        address,
      });

      // Reduce stock AFTER order success
      let totalCommissionPercentage = 0;
      for (const it of group.items) {
        await Product.findByIdAndUpdate(it.product, {
          $inc: { stock: -it.quantity },
        });
        totalCommissionPercentage += (it.commission || 0);
      }

      // Calculate Earnings
      const deliveryPartnerFee = shippingCharge * 0.8;
      const sellerEarning = finalTotal - group.platformCommission - shippingCharge;

      await SellerAnalytics.create({
        orderId: order._id,
        platformCommission: group.platformCommission,
        totalCommissionPercentage,
        sellerEarning,
        deliveryPartnerFee,
        sellerId: group.sellerId,
      });

      createdOrders.push(order);
    }

    res.status(201).json(createdOrders);
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
