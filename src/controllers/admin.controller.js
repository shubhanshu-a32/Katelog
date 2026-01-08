const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");
const { sendWhatsappMessage } = require("../services/whatsapp.service");
const DeliveryPartner = require("../models/DeliveryPartner");
const SellerAnalytics = require("../models/SellerAnalytics");

const getStats = async (req, res) => {
  const totalOrders = await Order.countDocuments();
  const totalRevenue = await Order.aggregate([
    { $group: { _id: null, total: { $sum: "$totalAmount" } } }
  ]);

  const revenueBySeller = await Order.aggregate([
    {
      $group: {
        _id: "$sellerId",
        total: { $sum: "$totalAmount" },
        orders: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "sellerprofiles",
        localField: "_id",
        foreignField: "userId",
        as: "sellerInfo"
      }
    },
    { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1, // sellerId
        total: 1,
        orders: 1,
        sellerName: { $ifNull: ["$sellerInfo.shopName", "Unknown Seller"] }
      }
    },
    { $sort: { total: -1 } }
  ]);

  // Calculate stats by Category (requires joining Orders -> Products)
  // For simplicity/performance, we might mock this or do a simpler query. 
  // Let's try a proper aggregation if possible, or fallback to mock if too complex for 'Order' schema without unwinding.
  // Assuming Order.products contains category info? likely not. 
  // If too complex, valid fallback is to return 0s to prevent crash, then improve.

  // CRITICAL FIX: The frontend expects { count, revenue }, but we were sending { products }.
  // For now, let's just use the Product aggregation but alias it to prevent crash, 
  // OR fix it properly. 

  // Let's use the Order aggregation on 'items' presumably.
  const ordersByCategory = await Order.aggregate([
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    { $unwind: "$productDetails" },
    {
      $group: {
        _id: "$productDetails.category",
        count: { $sum: "$items.quantity" },
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
      }
    },
    // Added lookup for Category name
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "categoryInfo"
      }
    },
    { $unwind: "$categoryInfo" },
    {
      $project: {
        _id: "$categoryInfo.title", // Logic uses title/name
        count: 1,
        revenue: 1
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  res.json({
    totalOrders,
    totalRevenue: totalRevenue[0]?.total || 0,
    revenueBySeller,
    ordersByCategory
  });
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'buyer' }).select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch profile
    const profile = await BuyerProfile.findOne({ userId: id });

    // Fetch orders (placed by buyer)
    const orders = await Order.find({ buyer: id })
      .populate("items.product", "title price images")
      .sort({ createdAt: -1 });

    res.json({ user, profile, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user details" });
  }
};

const getSellerById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).json({ message: "Seller not found" });

    const profile = await SellerProfile.findOne({ userId: id });

    // For sellers, orders meant "Received Orders" (sold by them)
    const orders = await Order.find({ sellerId: id })
      .populate("buyer", "fullName mobile email")
      .populate("items.product", "title price images")
      .sort({ createdAt: -1 });

    res.json({ user, profile, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch seller details" });
  }
};

const SellerProfile = require("../models/SellerProfile");
const BuyerProfile = require("../models/BuyerProfile");
const bcrypt = require("bcryptjs");

const getAllSellers = async (req, res) => {
  try {
    // Return Sellers with their Profile Info (ShopName, etc.)
    const sellers = await User.aggregate([
      { $match: { role: "seller" } },
      {
        $lookup: {
          from: "sellerprofiles",
          localField: "_id",
          foreignField: "userId",
          as: "profile"
        }
      },
      {
        $unwind: { path: "$profile", preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          _id: 0, // Frontend expects a wrapper object with userId inside, or we can reshape.
          // Based on frontend AdminSellers.jsx: seller.userId._id, seller.shopName
          // It seems frontend expects an object where .userId is the user object/id?
          // Let's match frontend expectation: Wrapper object has { userId: UserDoc, shopName: ..., ... }
          // Or simplified: { userId: UserDoc, shopName: ... }

          userId: {
            _id: "$_id",
            name: "$name",
            email: "$email",
            mobile: "$mobile",
            role: "$role",
            createdAt: "$createdAt"
          },
          shopName: { $ifNull: ["$profile.shopName", "Unnamed Shop"] },
          createdAt: "$createdAt",
          _id: "$_id" // Top level ID for key
        }
      }
    ]);
    res.json(sellers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch sellers" });
  }
};

const getUserOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await Order.find({ buyer: id })
      .populate("items.product", "title price images")
      .populate("sellerId", "ownerName shopName")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user orders" });
  }
};

const getSellerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await Order.find({ sellerId: id })
      .populate("buyer", "fullName mobile email")
      .populate("items.product", "title price images")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch seller orders" });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const { buyerId, status } = req.query;
    const filter = {};

    if (buyerId && mongoose.Types.ObjectId.isValid(buyerId)) {
      filter.buyer = buyerId;
    }

    if (status && status !== "undefined" && status !== "null" && status !== "") {
      filter.orderStatus = status;
    }

    const orders = await Order.find(filter)
      .populate("buyer", "fullName mobile email")
      .populate("items.product", "title price images")
      .populate("sellerId", "ownerName shopName")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("getAllOrders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

const createUser = async (req, res) => {
  try {
    const { name, mobile, role, shopName } = req.body;

    if (!name || !mobile || !role) {
      return res.status(400).json({ message: "Name, Mobile, and Role are required" });
    }

    const existingUser = await User.findOne({ mobile });
    if (existingUser) return res.status(400).json({ message: "Mobile number already exists" });

    // Create base User
    const userPayload = {
      mobile,
      role,
      // Map common 'name' input to specific schema fields based on role
      ...(role === 'buyer' ? { fullName: name } : {}),
      ...(role === 'seller' ? { ownerName: name, shopName: shopName || `${name}'s Shop` } : {})
    };

    const user = await User.create(userPayload);

    // Create extended profile (BuyerProfile / SellerProfile)
    // Note: User model now has some fields directly, but we keep profiles for extended data if needed.
    if (role === 'seller') {
      await SellerProfile.create({
        userId: user._id,
        shopName: shopName || `${name}'s Shop`,
        businessPhone: mobile
      });
    } else if (role === 'buyer') {
      await BuyerProfile.create({
        userId: user._id,
        fullName: name,
        // Email removed from required inputs
      });
    }

    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create user" });
  }
};

const deleteSeller = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    await SellerProfile.findOneAndDelete({ userId: id });
    // TODO: Cascade delete products/orders if needed
    res.json({ message: "Seller deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete seller" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    await BuyerProfile.findOneAndDelete({ userId: id });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
};

// Reusing Category Logic or Implementing Simple One
const Category = require("../models/Category");

const addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    // Check if category exists
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const existing = await Category.findOne({ slug });
    if (existing) return res.status(400).json({ message: "Category already exists" });

    const cat = await Category.create({
      title: name,
      slug
    });
    res.json(cat);
  } catch (err) {
    console.error("addCategory error:", err);
    res.status(400).json({ message: "Failed to add category" });
  }
};

const SubCategory = require("../models/SubCategory");

const addSubCategory = async (req, res) => {
  try {
    const { categoryId, name } = req.body;
    if (!categoryId || !name) return res.status(400).json({ message: "CategoryId and Name are required" });

    const parentCat = await Category.findById(categoryId);
    if (!parentCat) return res.status(404).json({ message: "Parent category not found" });

    const slug = name.toLowerCase().replace(/\s+/g, '-');

    // Check if subcategory exists
    const existing = await SubCategory.findOne({ slug, category: categoryId });
    if (existing) return res.status(400).json({ message: "Subcategory already exists in this category" });

    const subCat = await SubCategory.create({
      title: name,
      slug,
      category: categoryId
    });

    // Fetch updated list of subcategories for this parent to return the full updated parent object
    // This ensures the frontend can update its state immediately.
    const allSubCats = await SubCategory.find({ category: categoryId }).lean();

    const updatedParent = {
      _id: parentCat._id,
      name: parentCat.title,
      slug: parentCat.slug,
      subCategories: allSubCats.map(sub => ({
        _id: sub._id,
        name: sub.title,
        slug: sub.slug,
        category: sub.category
      }))
    };

    res.json(updatedParent);
  } catch (err) {
    console.error("addSubCategory error:", err);
    res.status(400).json({ message: "Failed to add subcategory" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await Category.findByIdAndDelete(id);
    await SubCategory.deleteMany({ category: id }); // Cascade delete
    res.json({ message: "Category and its subcategories deleted" });
  } catch (err) {
    console.error("deleteCategory error:", err);
    res.status(500).json({ message: "Failed to delete category" });
  }
};

const deleteSubCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await SubCategory.findByIdAndDelete(id);
    res.json({ message: "Subcategory deleted" });
  } catch (err) {
    console.error("deleteSubCategory error:", err);
    res.status(500).json({ message: "Failed to delete subcategory" });
  }
};

const createDeliveryPartner = async (req, res) => {
  try {
    const { name, mobile, pincode } = req.body;
    if (!name || !mobile || !pincode) {
      return res.status(400).json({ message: "Name, Mobile and Pincode are required" });
    }

    // Check for existing user with this mobile
    const existing = await User.findOne({ mobile });
    if (existing) {
      // Check if it's an "orphan" (Delivery Partner role, but no Profile)
      // Or simply if it's a delivery_partner, check if profile exists.
      if (existing.role === 'delivery_partner') {
        const existingProfile = await DeliveryPartner.findOne({ userId: existing._id });
        if (!existingProfile) {
          // It's an orphan! Delete it to allow reuse.
          await User.findByIdAndDelete(existing._id);
          console.log(`[CreatePartner] Cleaned up orphan user for mobile ${mobile}`);
        } else {
          return res.status(400).json({ message: "Mobile number already exists" });
        }
      } else {
        return res.status(400).json({ message: "Mobile number already exists (User is registered as ${existing.role})" });
      }
    }

    // 1. Create User
    const user = await User.create({
      mobile,
      role: 'delivery_partner',
      fullName: name
    });

    // 2. Create DeliveryPartner Profile
    const profile = await DeliveryPartner.create({
      userId: user._id,
      fullName: name,
      mobile,
      pincode
    });

    res.status(201).json({ user, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create delivery partner" });
  }
};

const getAllDeliveryPartners = async (req, res) => {
  try {
    const { pincode } = req.query;
    const filter = { role: 'delivery_partner' };

    // If Pincode is provided, we query DeliveryPartner model first
    if (pincode) {
      const profiles = await DeliveryPartner.find({ pincode }).populate('userId');
      // Transform to simplified structure or return as is. 
      // Keeping it simple: Return array of { ...profile, userId: UserDoc }
      return res.json(profiles);
    }

    // Default: List all users with role 'delivery_partner' 
    // BUT richer data comes from DeliveryPartner model, so let's query that instead if possible.
    // However, for backward compatibility or if profile missing, fallback?
    // Let's standardise: Always fetch from DeliveryPartner model if possible.
    // If older partners don't have profile, we might miss them.
    // Let's fetch DeliveryPartners and populate User.
    const allProfiles = await DeliveryPartner.find().populate('userId');
    res.json(allProfiles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch delivery partners" });
  }
};

const updateDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, pincode, status } = req.body;

    // 1. Find Delivery Partner Profile
    const profile = await DeliveryPartner.findById(id);
    if (!profile) return res.status(404).json({ message: "Delivery partner profile not found" });

    // 2. Find Associated User
    const user = await User.findById(profile.userId);
    if (!user) return res.status(404).json({ message: "Associated user not found" });

    // 3. Update Fields
    if (name) {
      profile.fullName = name;
      user.fullName = name;
    }
    if (pincode) {
      profile.pincode = pincode;
    }
    if (status) {
      profile.status = status;
    }

    // 4. Handle Mobile Update (Unique Check)
    if (mobile && mobile !== user.mobile) {
      const existing = await User.findOne({ mobile });
      if (existing) {
        // ORPHAN CHECK: If user exists but is an orphan delivery partner (no profile), clean up.
        if (existing.role === 'delivery_partner') {
          const existingProfile = await DeliveryPartner.findOne({ userId: existing._id });
          if (!existingProfile) {
            // Clean orphan
            await User.findByIdAndDelete(existing._id);
            console.log(`[UpdatePartner] Cleaned up orphan user for mobile ${mobile}`);
          } else {
            return res.status(400).json({ message: "Mobile number already exists" });
          }
        } else {
          return res.status(400).json({ message: "Mobile number already exists" });
        }
      }

      profile.mobile = mobile;
      user.mobile = mobile;
    }

    await user.save();
    await profile.save();

    res.json({ message: "Delivery partner updated", profile, user });
  } catch (err) {
    console.error("Update Delivery Partner Error:", err);
    res.status(500).json({ message: "Failed to update delivery partner" });
  }
};

const deleteDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await DeliveryPartner.findById(id);
    if (!profile) return res.status(404).json({ message: "Delivery partner not found" });

    // Delete associated user FIRST using the userId from profile
    await User.findByIdAndDelete(profile.userId);
    // Then delete profile
    await DeliveryPartner.findByIdAndDelete(id);

    res.json({ message: "Delivery partner deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete delivery partner" });
  }
};

const assignOrderToPartner = async (req, res) => {
  try {
    const { id } = req.params; // Order ID
    let { partnerId } = req.body;

    // Handle payload variations (if partnerId is an object or we get deliveryPartnerId)
    if (typeof partnerId === 'object' && partnerId !== null && partnerId._id) {
      partnerId = partnerId._id;
    } else if (!partnerId && req.body.deliveryPartnerId) {
      partnerId = req.body.deliveryPartnerId;
    }

    console.log(`[AssignOrder] Order: ${id}, Partner: ${partnerId}`);

    // ALLOW UNASSIGNMENT: If partnerId is explicitly NULL, we unassign the partner.
    if (Object.keys(req.body).includes('partnerId') && req.body.partnerId === null) {
      console.log(`[AssignOrder] Unassigning order ${id}`);
      // Reset order fields
      const orderToReset = await Order.findById(id);
      if (!orderToReset) return res.status(404).json({ message: "Order not found" });

      orderToReset.deliveryPartner = null;
      // Optionally reset status or keep as is? User said "reassign", so maybe just clearing plain partner.
      // But if unassigning, maybe set status back to PENDING if it was CONFIRMED?
      // Safe bet: just nullify partner.
      await orderToReset.save();
      return res.json({ message: "Order unassigned successfully", order: orderToReset });
    }

    if (!partnerId) {
      console.error("[AssignOrder] Missing partnerId in payload:", req.body);
      return res.status(400).json({ message: "Partner ID is required" });
    }

    const partner = await User.findById(partnerId);
    if (!partner || partner.role !== 'delivery_partner') {
      return res.status(400).json({ message: "Invalid delivery partner" });
    }

    const order = await Order.findById(id)
      .populate("sellerId", "ownerName shopName mobile address lat lng")
      .populate("buyer", "fullName mobile");

    if (!order) return res.status(404).json({ message: "Order not found" });

    // --- PINCODE VALIDATION ---
    // Fetch Seller Profile to get pincode
    const sellerProfile = await SellerProfile.findOne({ userId: order.sellerId._id });
    if (!sellerProfile || !sellerProfile.pincode) {
      return res.status(400).json({ message: "Seller pincode not found. Cannot validate delivery area." });
    }

    // Fetch Delivery Partner Profile to get pincode
    const partnerProfile = await DeliveryPartner.findOne({ userId: partnerId });
    if (!partnerProfile || !partnerProfile.pincode) {
      return res.status(400).json({ message: "Delivery partner pincode not found." });
    }

    // Compare Pincodes (Ensure types match)
    const sellerPincode = String(sellerProfile.pincode).trim();
    const partnerPincode = String(partnerProfile.pincode).trim();

    if (sellerPincode !== partnerPincode) {
      return res.status(400).json({
        message: `Pincode mismatch! Seller is in ${sellerPincode}, but Partner is in ${partnerPincode}.`
      });
    }
    // --------------------------

    // Update Order
    order.deliveryPartner = partnerId;
    order.orderStatus = "CONFIRMED"; // Auto-confirm on assignment? Or just assign. User didn't specify, but usually assignment implies process start.
    await order.save();

    // 1. Notify Delivery Partner via WhatsApp
    // Message: "Pickup from [Seller Address], Deliver to [Buyer Address]"

    // Construct Map Link if coordinates exist
    let mapLink = "";
    if (order.sellerId.lat && order.sellerId.lng) {
      mapLink = `\nMap: https://www.google.com/maps?q=${order.sellerId.lat},${order.sellerId.lng}`;
    }

    const pickupMsg = `Hello ${partner.fullName},\nNew Order Assigned!\n\nPICKUP FROM:\nShop: ${order.sellerId.shopName}\nMobile: ${order.sellerId.mobile}\nAddress: ${order.sellerId.address || "Address not set"}${mapLink}\n\nDELIVER TO:\nBuyer: ${order.buyer.fullName}\nMobile: ${order.buyer.mobile}\nAddress: ${order.address?.fullAddress || "Address not provided"}\n\nPlease proceed immediately.`;

    await sendWhatsappMessage(partner.mobile, pickupMsg);

    // 2. Notify Seller via WhatsApp
    // Requested Format: "Delivery boy 'name' coming to your address for the order 'order-details' and it will deliver to 'buyer-name, address'"

    // Format Order Details with safe checks
    const orderDetails = order.items
      .map(item => {
        const title = item.product ? item.product.title : "Unknown Product";
        return `${item.quantity} x ${title}`;
      })
      .join(", ");

    // Format Buyer Address with safe checks
    let buyerAddressStr = "Address not provided";
    if (order.address) {
      const parts = [
        order.address.fullAddress,
        order.address.city,
        order.address.pincode
      ].filter(part => part); // Filter out null/undefined/empty strings

      if (parts.length > 0) {
        buyerAddressStr = parts.join(", ");
      }
    }

    const sellerMsg = `Delivery boy "${partner.fullName}" coming to your address for the order "${orderDetails}" and it will deliver to "${order.buyer.fullName}, ${buyerAddressStr}".`;

    await sendWhatsappMessage(order.sellerId.mobile, sellerMsg);

    res.json({ message: "Order assigned and notifications sent", order });
  } catch (err) {
    console.error("Assign Order Error:", err);
    res.status(500).json({ message: "Failed to assign order" });
  }
};


const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    console.log(`[UpdateStatus] Order: ${id}, Payload:`, req.body);

    // Normalize: If status missing, check orderStatus (from potential frontend mixup)
    if (!status && req.body.orderStatus) {
      status = req.body.orderStatus;
    }

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // Normalize casing and aliases
    status = status.toUpperCase();
    if (status === "COMPLETED") status = "DELIVERED";

    const validStatuses = ["PLACED", "PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      console.warn(`[UpdateStatus] Invalid status: ${status}`);
      return res.status(400).json({ message: `Invalid status: ${status}` });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.orderStatus = status;
    await order.save();

    res.json({ message: "Order status updated", order });
  } catch (err) {
    console.error("Update Order Status Error:", err);
    res.status(500).json({ message: "Failed to update order status" });
  }
};

const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const validStatuses = ["PLACED", "PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];

    // If orderStatus is provided, validate it
    if (orderStatus && !validStatuses.includes(orderStatus)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Update fields if present in body
    if (orderStatus) order.orderStatus = orderStatus;

    await order.save();

    res.json({ message: "Order updated successfully", order });
  } catch (err) {
    console.error("Update Order Error:", err);
    res.status(500).json({ message: "Failed to update order" });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndDelete(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error("Delete Order Error:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
};


const getAllAnalytics = async (req, res) => {
  try {
    const { filter, date } = req.query;
    let query = {};

    if (filter && filter !== 'all_time' && date) {
      // Create a date object relative to the client's day provided (ensure YYYY-MM-DD format works)
      // If date is "2026-01-08", new Date("2026-01-08") is UTC 00:00.
      // If we simply rely on that for filtering against createdAt (which is UTC), it should work IF query logic is correct.
      // However, to be extra safe and inclusive of the entire "local" day as intended by the user:

      const selectedDate = new Date(date);
      let startDate, endDate;

      if (filter === 'date') {
        // Range: 00:00:00.000 to 23:59:59.999 of the specific date
        // Use the string components to avoid timezone shifts if possible, or reset hours safely.
        startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);

      } else if (filter === 'week') {
        // Week (Sunday to Saturday)
        // If today is Thursday (8th), and we want "This Week", it should be Sun 4th to Sat 10th.
        const currentDay = selectedDate.getDay(); // 0-6

        startDate = new Date(selectedDate);
        startDate.setDate(selectedDate.getDate() - currentDay);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);

      } else if (filter === 'month') {
        // Full Month
        startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
      }

      console.log(`[Analytics Filter] Type: ${filter}, Date: ${date}`);
      console.log(`[Analytics Filter] Range: ${startDate.toISOString()} - ${endDate.toISOString()}`);

      if (startDate && endDate) {
        query.createdAt = { $gte: startDate, $lte: endDate };
      }
    }

    const analytics = await SellerAnalytics.find(query)
      .select("orderId platformCommission totalCommissionPercentage sellerEarning deliveryPartnerFee platformCommissionStatus deliveryPartnerFeeStatus sellerId createdAt")
      .populate({
        path: "orderId",
        populate: {
          path: "items.product",
          select: "title price images"
        }
      })
      .populate("sellerId", "ownerName shopName mobile")
      .sort({ createdAt: -1 })
      .lean();

    const analyticsWithTotal = analytics.map(record => ({
      ...record,
      totalCommission: (record.platformCommission || 0) + (record.deliveryPartnerFee || 0)
    }));

    res.json(analyticsWithTotal);
  } catch (err) {
    console.error("getAllAnalytics error:", err);
    res.status(500).json({ message: "Failed to fetch analytics" });
  }
};

const deleteAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SellerAnalytics.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Analytics record not found" });

    res.json({ message: "Analytics record deleted" });
  } catch (err) {
    console.error("deleteAnalytics error:", err);
    res.status(500).json({ message: "Failed to delete analytics record" });
  }
};

const updateAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { platformCommissionStatus, deliveryPartnerFeeStatus } = req.body;

    console.log(`[UpdateAnalytics] ID: ${id}, Body:`, req.body);

    const analytics = await SellerAnalytics.findById(id);
    if (!analytics) {
      return res.status(404).json({ message: "Analytics record not found" });
    }

    if (platformCommissionStatus !== undefined) {
      // Handle boolean or string
      if (platformCommissionStatus === true || platformCommissionStatus === "true") {
        analytics.platformCommissionStatus = "COMPLETED";
      } else if (platformCommissionStatus === false || platformCommissionStatus === "false") {
        analytics.platformCommissionStatus = "PENDING";
      } else {
        analytics.platformCommissionStatus = platformCommissionStatus.toUpperCase();
      }
    }

    if (deliveryPartnerFeeStatus !== undefined) {
      // Handle boolean or string
      if (deliveryPartnerFeeStatus === true || deliveryPartnerFeeStatus === "true") {
        analytics.deliveryPartnerFeeStatus = "COMPLETED";
      } else if (deliveryPartnerFeeStatus === false || deliveryPartnerFeeStatus === "false") {
        analytics.deliveryPartnerFeeStatus = "PENDING";
      } else {
        analytics.deliveryPartnerFeeStatus = deliveryPartnerFeeStatus.toUpperCase();
      }
    }

    await analytics.save();

    res.json({ message: "Analytics updated successfully", analytics });
  } catch (err) {
    console.error("updateAnalytics error:", err);
    res.status(500).json({ message: "Failed to update analytics record", error: err.message });
  }
};

module.exports = {
  getStats,
  getAllUsers,
  createUser,
  getUserById,
  getUserOrders,
  deleteUser,
  getAllSellers,
  getSellerById,
  getSellerOrders,
  deleteSeller,
  getAllOrders,
  assignOrderToPartner,
  updateOrderStatus,
  updateOrder,
  deleteOrder,
  createDeliveryPartner,
  getAllDeliveryPartners,
  updateDeliveryPartner,
  deleteDeliveryPartner,
  addCategory,
  addSubCategory,
  deleteCategory,
  deleteSubCategory,
  getAllAnalytics,
  deleteAnalytics,
  updateAnalytics
};
