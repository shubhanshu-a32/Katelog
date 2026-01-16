const mongoose = require("mongoose");
const User = require("../models/User");
const SellerProfile = require("../models/SellerProfile");
const Order = require("../models/Order");
const DeliveryPartner = require("../models/DeliveryPartner");
const Category = require("../models/Category");
const SellerAnalytics = require("../models/SellerAnalytics");
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const xlsx = require("xlsx");
const { sendWhatsappMessage } = require("../services/whatsapp.service");
const PDFDocument = require("pdfkit");
const BuyerProfile = require("../models/BuyerProfile");
const Variant = require("../models/Variant");
const bcrypt = require("bcryptjs");

// Moved from offer.controller.js
const applyOffer = async (req, res) => {
  try {
    const { code, amount, userId, products, categoryId } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ message: "Code and userId are required" });
    }

    const offer = await Offer.findOne({ code: code.toUpperCase(), isActive: true });
    if (!offer) {
      return res.status(404).json({ message: "Invalid or inactive offer code" });
    }

    // Check expiry date
    if (offer.expiryDate) {
      const now = new Date();
      const expiry = new Date(offer.expiryDate);
      // Set expiry to end of the day (inclusive)
      expiry.setHours(23, 59, 59, 999);

      if (now > expiry) {
        return res.status(400).json({ message: "This coupon has expired" });
      }
    }

    // REMOVED: Usage limit check as per user request (Step 511)

    // Calculate category-specific total if coupon has category restrictions
    let applicableAmount = amount || 0;

    if (offer.applicableCategories && offer.applicableCategories.length > 0) {
      // Coupon has category restrictions - calculate total from matching products only
      if (!products || products.length === 0) {
        return res.status(400).json({
          message: "This coupon requires product information"
        });
      }

      // Fetch product details to get categories
      const productIds = products.map(p => p.id);
      const productDetails = await Product.find({ _id: { $in: productIds } }).select("category price");

      // Calculate total only from products matching the coupon's categories
      let categoryTotal = 0;
      products.forEach(item => {
        const productDetail = productDetails.find(p => p._id.toString() === item.id.toString());
        if (productDetail) {
          // Check if product's category matches any of the coupon's applicable categories
          const categoryMatches = offer.applicableCategories.some(
            catId => catId.toString() === productDetail.category.toString()
          );
          if (categoryMatches) {
            categoryTotal += productDetail.price * item.qty;
          }
        }
      });

      if (categoryTotal === 0) {
        // Fetch category names for better error message
        const Category = require("../models/Category");
        const allowedCategories = await Category.find({ _id: { $in: offer.applicableCategories } }).select("title");
        const allowedNames = allowedCategories.map(c => c.title).join(", ");

        return res.status(400).json({
          message: `This coupon is only applicable to items in: ${allowedNames || "specific categories"}`
        });
      }

      applicableAmount = categoryTotal;
    }

    // Check minimum cart amount (using category-specific total if applicable)
    if (offer.minCartAmount && applicableAmount < offer.minCartAmount) {
      return res.status(400).json({
        message: `Minimum cart value of ₹${offer.minCartAmount} required for this coupon`
      });
    }

    const discountValue = offer.conditionValue;

    // Validate: Discount cannot exceed applicable amount
    if (discountValue > applicableAmount) {
      return res.status(400).json({
        message: `Cart value for applicable products (₹${applicableAmount}) is less than coupon discount (₹${discountValue})`
      });
    }

    // Calculate final discount
    let discount = Math.min(discountValue, applicableAmount);

    // Calculate final amount
    const finalAmount = Math.max(0, (amount || applicableAmount) - discount);

    // Context description
    const context = products ? JSON.stringify(products) : "No product details provided";

    // Update Offer with Usage (Only for registered users)
    if (userId && userId !== "guest") {
      offer.usageHistory.push({
        userId,
        originalAmount: amount || applicableAmount,
        discountAmount: discount,
        finalAmount,
        productContext: context
      });
      await offer.save();
    }

    res.json({
      success: true,
      message: "Offer applied successfully",
      discountAmount: discount,
      originalAmount: amount || applicableAmount,
      finalAmount,
      applicableAmount // Send back the category-specific total for frontend reference
    });

  } catch (err) {
    console.error("applyOffer error:", err);
    res.status(500).json({ message: "Failed to apply offer" });
  }
};

const toggleOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await Offer.findById(id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    offer.isActive = !offer.isActive;
    await offer.save();

    res.json({ message: "Offer status updated", offer });
  } catch (err) {
    console.error("toggleOfferStatus error:", err);
    res.status(500).json({ message: "Failed to update offer status" });
  }
};

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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Seller ID" });
    }

    const userDoc = await User.findById(id).select('-password');
    if (!userDoc) return res.status(404).json({ message: "Seller not found" });

    // Use plain object for safer manipulation
    const user = userDoc.toObject();

    const profileDoc = await SellerProfile.findOne({ userId: id });
    console.log(`[GetSeller] ID: ${id}, User Found: Yes, Profile Found: ${!!profileDoc}`);

    // Merging User data into Profile for display robustness
    let profileData = profileDoc ? profileDoc.toObject() : {};

    // Helper to pick best value
    const pickVal = (pVal, uVal) => (pVal && String(pVal).trim() !== "") ? pVal : uVal;

    profileData.mobile = pickVal(profileData.mobile, user.mobile);
    profileData.businessPhone = pickVal(profileData.businessPhone, user.mobile);
    profileData.shopName = pickVal(profileData.shopName, user.shopName || user.ownerName);
    profileData.address = pickVal(profileData.address, user.address);
    profileData.ownerName = pickVal(profileData.ownerName, user.ownerName);
    profileData.email = pickVal(profileData.email, user.email);

    // Try to extract pincode from address if missing or zero
    if (!profileData.pincode && profileData.address && typeof profileData.address === 'string') {
      try {
        const pinMatch = profileData.address.match(/\b\d{6}\b/);
        if (pinMatch) profileData.pincode = Number(pinMatch[0]);
      } catch (e) {
        console.warn("Error extracting pincode from address:", e);
      }
    }

    // Exclude Sensitive Bank Details
    if (profileData.bankDetails) {
      delete profileData.bankDetails;
    }

    // Fetch orders safely
    let orders = [];
    try {
      orders = await Order.find({ sellerId: id })
        .populate("buyer", "fullName mobile email")
        .populate("items.product", "title price images")
        .sort({ createdAt: -1 })
        .lean();
    } catch (orderErr) {
      console.error("Error fetching seller orders:", orderErr);
    }

    console.log(`[GetSeller] Returning loaded profile for ${id}`);
    res.json({ user, profile: profileData, orders });
  } catch (err) {
    console.error(`[GetSeller] CRITICAL ERROR for ID: ${req.params.id}`, err);
    res.status(500).json({ message: "Failed to fetch seller details" });
  }
};



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
            mobile: "$mobile",
            role: "$role",
            createdAt: "$createdAt",
            profilePicture: "$profilePicture"
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
      .populate("sellerId", "ownerName shopName profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with Seller Pincode
    const sellerIds = [...new Set(orders.map(o => o.sellerId?._id).filter(id => id))];
    const sellerProfiles = await SellerProfile.find({ userId: { $in: sellerIds } }).select("userId pincode");

    // Map pincodes
    const pincodeMap = {};
    sellerProfiles.forEach(sp => {
      pincodeMap[sp.userId.toString()] = sp.pincode;
    });

    // Attach to orders
    orders.forEach(order => {
      if (order.sellerId && order.sellerId._id) {
        order.sellerId.pincode = pincodeMap[order.sellerId._id.toString()];
      }
    });

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
    await Product.deleteMany({ sellerId: id });
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

const addCategory = async (req, res) => {
  try {
    const { name, slug: bodySlug, subcategories } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    // Check if category exists
    const slug = bodySlug || name.toLowerCase().replace(/\s+/g, '-');
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
      // Convert to string and trim for consistent querying
      const pinStr = String(pincode).trim();

      // Try finding by exact string match or numeric value if applicable
      // Using regex to handle potential whitespace differences if needed, or just $or
      const profiles = await DeliveryPartner.find({
        pincode: pinStr
      }).populate('userId');

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
    console.log("[AssignOrder] Executing Enriched Assignment Logic v2");

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

    // --- SELLER INFO RECOVERY & PINCODE VALIDATION ---
    const sellerUser = order.sellerId; // Populated User doc
    if (!sellerUser) {
      return res.status(400).json({ message: "Seller user not found for this order." });
    }

    let sellerProfile = await SellerProfile.findOne({ userId: sellerUser._id });

    // Fallback: If no profile, create a temporary object using User data
    if (!sellerProfile) {
      console.warn(`[AssignOrder] SellerProfile missing for ${sellerUser._id}, using User data.`);
      sellerProfile = {
        shopName: sellerUser.shopName || sellerUser.ownerName || "Unknown Shop",
        businessPhone: sellerUser.mobile,
        address: sellerUser.address,
        // Try explicit fields first, though User schema has them as default null/""
        pincode: null
      };
    }

    // Attempt to extract pincode if missing
    if (!sellerProfile.pincode) {
      // Try to find pincode in address string (User address or Profile address)
      const addrToSearch = sellerProfile.address || sellerUser.address || "";
      const pinMatch = addrToSearch.match(/\b\d{6}\b/);
      if (pinMatch) {
        sellerProfile.pincode = Number(pinMatch[0]);
        console.log(`[AssignOrder] Extracted pincode ${sellerProfile.pincode} from address.`);
      }
    }

    if (!sellerProfile.pincode) {
      // Final attempt: Check if sellerUser has a 'pincode' field (custom addition) or if we want to allow bypass?
      // Strict Mode: Block.
      return res.status(400).json({ message: "Seller pincode not found in Profile or Address. Cannot validate delivery area." });
    }

    // Fetch Delivery Partner Profile to get pincode
    const partnerProfile = await DeliveryPartner.findOne({ userId: partnerId });
    if (!partnerProfile || !partnerProfile.pincode) {
      return res.status(400).json({ message: "Delivery partner pincode not found." });
    }

    // Compare Pincodes (Ensure types match)
    const sellerPincode = String(sellerProfile.pincode).trim();
    const partnerPincode = String(partnerProfile.pincode).trim();

    console.log(`[AssignOrder] Comparing Pincodes - Seller: '${sellerPincode}' vs Partner: '${partnerPincode}'`);

    if (sellerPincode !== partnerPincode) {
      console.warn(`[AssignOrder] Mismatch Blocked: ${sellerPincode} !== ${partnerPincode}`);
      return res.status(400).json({
        message: `Pincode mismatch! Seller is in ${sellerPincode}, but Partner is in ${partnerPincode}.`
      });
    }
    // --------------------------

    // Update Order
    order.deliveryPartner = partnerId;
    order.orderStatus = "CONFIRMED";
    await order.save();

    // Determine Seller Contact Info
    let sellerMobileDisplay = "N/A";
    if (sellerProfile && sellerProfile.businessPhone) sellerMobileDisplay = sellerProfile.businessPhone;
    else if (sellerProfile && sellerProfile.whatsappNumber) sellerMobileDisplay = sellerProfile.whatsappNumber;
    else if (sellerUser.mobile) sellerMobileDisplay = sellerUser.mobile;

    // Determine Seller Address
    let sellerAddressDisplay = "Address not set";
    if (sellerProfile && sellerProfile.address) sellerAddressDisplay = sellerProfile.address;
    else if (sellerUser.address) sellerAddressDisplay = sellerUser.address;


    // --- GOOGLE MAP LINK GENERATION ---
    let mapLink = "";
    if (sellerUser.lat && sellerUser.lng) {
      mapLink = ` https://www.google.com/maps?q=${sellerUser.lat},${sellerUser.lng}`;
    } else {
      const addrForMap = sellerAddressDisplay !== "Address not set" ? sellerAddressDisplay : "";
      if (addrForMap) {
        const cleanAddr = addrForMap.replace(/\s+/g, '+');
        mapLink = ` https://www.google.com/maps/search/?api=1&query=${cleanAddr}`;
      }
    }


    // Format Buyer Address
    let buyerAddressStr = "Address not provided";
    if (order.address) {
      const cleanStr = (s) => s ? String(s).replace(/\bundefined\b/gi, "").replace(/\bnull\b/gi, "").trim() : "";
      const city = cleanStr(order.address.city);
      const pincode = cleanStr(order.address.pincode);
      let fullAddr = cleanStr(order.address.fullAddress);
      fullAddr = fullAddr.replace(/,\s*,/g, ",").replace(/,\s*-/g, " -").replace(/^,\s*/, "").replace(/,\s*$/, "");
      if (fullAddr && fullAddr.length > 5) buyerAddressStr = fullAddr;
      else {
        const parts = [fullAddr, city, pincode].filter(p => p);
        if (parts.length > 0) buyerAddressStr = parts.join(", ");
      }
      buyerAddressStr = buyerAddressStr.replace(/\bundefined\b/gi, "").replace(/\s\s+/g, " ").trim();
    }

    // Format Order Details
    const orderDetails = order.items
      .map((item, idx) => {
        const title = item.product ? item.product.title : "Unknown Product";
        return `${idx + 1}. ${title} x ${item.quantity} (₹${item.price || 0})`;
      })
      .join("\n");

    const extraDetails = `Total: ₹${order.totalAmount}\nPayment: ${order.paymentMode || 'COD'}\nOrder ID: ${order._id}`;

    const buyerName = order.buyer?.fullName || "Guest/Unknown";
    const buyerMobile = order.buyer?.mobile || "N/A";

    // Use best available number for Seller Notification
    const sellerNotifyNumber = (sellerMobileDisplay && sellerMobileDisplay !== "N/A")
      ? sellerMobileDisplay
      : sellerUser.mobile;

    const pickupMsg = `Hello ${partner.fullName},\nNew Order Assigned!\n\nORDER ID: ${order._id}\n\nPICKUP FROM:\nShop: ${sellerUser.shopName || sellerUser.ownerName}\nMobile: ${sellerMobileDisplay}\nAddress: ${sellerAddressDisplay}\nLocation: ${mapLink}\n\nDELIVER TO:\nBuyer: ${buyerName}\nMobile: ${buyerMobile}\nAddress: ${buyerAddressStr}\n\nITEMS:\n${orderDetails}\n\n${extraDetails}\n\nPlease proceed immediately.`;

    // 2. Notify Seller via WhatsApp
    // User requested format: "Hello seller.name, delivery partner {delivery partner.name}, {deliverypartner.mobile} is assigned and coming to take the product: {product.details} to deliver to {buyer.name}, {products details}"

    // Clean up order details for inline use if needed, or keep block regular.
    // Let's use a nice block format but with the requested intro phrase.
    // Updated format per user request
    const sellerMsg = `Hello seller ${sellerUser.shopName || sellerUser.ownerName || "Seller"},\ndelivery partner is assigned ${partner.fullName}, ${partner.mobile} to deliver ${orderDetails} to ${buyerName}, ${buyerMobile}, ${buyerAddressStr}. So, please ready the above product to give it to delivery partner.\nThank You!!`;

    try {
      console.log(`[AssignOrder] Sending to PARTNER (${partner.mobile}):\n${pickupMsg}`);
      await sendWhatsappMessage(partner.mobile, pickupMsg);

      console.log(`[AssignOrder] Sending to SELLER (${sellerNotifyNumber}):\n${sellerMsg}`);
      await sendWhatsappMessage(sellerNotifyNumber, sellerMsg);
    } catch (msgErr) {
      console.error("[AssignOrder] Message sending failed (Non-fatal):", msgErr);
    }

    res.json({
      message: "Order assigned and notifications sent",
      order,
      sellerMsg,
      pickupMsg,
      sellerMobile: sellerNotifyNumber,
      partnerMobile: partner.mobile
    });
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


/* --- Helper: Build Query --- */
/* --- Helper: Build Query --- */
const _buildAnalyticsQuery = async (filter, dateStr, search) => {
  let query = {};
  if (filter && filter !== "all_time" && dateStr) {
    const selectedDate = new Date(dateStr);
    let startDate, endDate;

    if (filter === "date") {
      startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === "week") {
      const currentDay = selectedDate.getDay();
      startDate = new Date(selectedDate);
      startDate.setDate(selectedDate.getDate() - currentDay);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === "month") {
      startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === "year") {
      startDate = new Date(selectedDate.getFullYear(), 0, 1);
      endDate = new Date(selectedDate.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
    }

    if (startDate && endDate) {
      query.createdAt = { $gte: startDate, $lte: endDate };
    }
  }

  // --- Search Filter Logic ---
  if (search) {
    const searchRegex = new RegExp(search, "i");
    const sellers = await User.find({
      role: "seller",
      $or: [
        { shopName: searchRegex },
        { ownerName: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex }
      ]
    }).select("_id");

    const sellerIds = sellers.map(s => s._id);
    query.sellerId = { $in: sellerIds };
  }

  return query;
};

const getAllAnalytics = async (req, res) => {
  try {
    const { filter, date, search } = req.query;
    const query = await _buildAnalyticsQuery(filter, date, search);

    const analytics = await SellerAnalytics.find(query)
      .select("orderId platformCommission totalCommissionPercentage sellerEarning deliveryPartnerFee platformCommissionStatus deliveryPartnerFeeStatus sellerId createdAt")
      .populate({
        path: "orderId",
        select: "_id totalAmount createdAt items shippingCharge", // Only need basic order info
        populate: { path: "items.product", select: "title price" } // Keep minimal
      })
      .populate("sellerId", "shopName ownerName mobile")
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

const downloadAnalyticsExcel = async (req, res) => {
  try {
    const { filter, date, search } = req.query;
    const query = await _buildAnalyticsQuery(filter, date, search);

    const analytics = await SellerAnalytics.find(query)
      .populate("sellerId", "shopName ownerName mobile")
      .populate({
        path: "orderId",
        select: "_id totalAmount createdAt items shippingCharge",
        populate: { path: "items.product", select: "title" }
      })
      .sort({ createdAt: -1 });

    const data = analytics.map(a => {
      const seller = a.sellerId || {};
      const order = a.orderId || {};

      const orderDetails = order.items
        ? order.items.map(item => item.product ? item.product.title : "Unknown").join(", ")
        : "-";

      const commStatus = a.platformCommissionStatus === "COMPLETED" ? "Paid" : "Pending";
      const delStatus = a.deliveryPartnerFeeStatus === "COMPLETED" ? "Paid" : "Pending";

      return {
        "Order ID": order._id ? order._id.toString() : "-",
        " ": "",
        "Order Details": orderDetails,
        "  ": "",
        "Seller": seller.shopName || "Unknown",
        "   ": "",
        "Total Value": order.totalAmount || 0,
        "    ": "",
        "Comm. %": a.totalCommissionPercentage || 0,
        "     ": "",
        "Comm. Amt": a.platformCommission || 0,
        "      ": "",
        "Seller Pay": a.sellerEarning || 0,
        "       ": "",
        "Delivery Chg": order.shippingCharge || 0,
        "        ": "",
        "Partner Pay": a.deliveryPartnerFee || 0,
        "         ": "",
        "Del. Comm.": delStatus
      };
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);

    // Adjusted widths to account for added spacer columns
    const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: key.trim() === "" ? 2 : key.length + 12 }));
    ws['!cols'] = colWidths;

    xlsx.utils.book_append_sheet(wb, ws, "Analytics");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="analytics.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);

  } catch (err) {
    console.error("Download Excel Error:", err);
    res.status(500).json({ message: "Failed to download Excel" });
  }
};

const downloadAnalyticsPDF = async (req, res) => {
  try {
    const { filter, date, search } = req.query;
    const query = await _buildAnalyticsQuery(filter, date, search);

    const analytics = await SellerAnalytics.find(query)
      .populate("sellerId", "shopName ownerName")
      .populate({
        path: "orderId",
        select: "_id totalAmount items shippingCharge",
        populate: { path: "items.product", select: "title" }
      })
      .sort({ createdAt: -1 });

    const doc = new PDFDocument({ margin: 15, size: 'A4', layout: 'landscape' });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="analytics.pdf"');
    doc.pipe(res);

    doc.fontSize(16).text("Seller Analytics Report", { align: "center" });
    doc.fontSize(10).text(`Filter: ${filter || "All Time"} | Date: ${date || "-"}`, { align: "center" });
    doc.moveDown();

    const tableTop = doc.y;
    // Widened X coordinates for gaps
    const cols = [
      { name: "Order ID", x: 10, w: 85 },
      { name: "Order Details", x: 110, w: 120 },
      { name: "Seller", x: 245, w: 80 },
      { name: "Total Value", x: 340, w: 45 },
      { name: "Comm.%", x: 400, w: 35 },
      { name: "Comm.Amt", x: 450, w: 45 },
      { name: "Seller Pay", x: 510, w: 45 },
      { name: "Del.Chg", x: 570, w: 40 },
      { name: "P.Pay", x: 625, w: 40 },
      { name: "Del.Comm", x: 680, w: 80 }
    ];

    doc.font('Helvetica-Bold').fontSize(8);
    cols.forEach(c => doc.text(c.name, c.x, tableTop, { width: c.w, align: 'left' }));
    doc.moveTo(10, tableTop + 15).lineTo(830, tableTop + 15).stroke();

    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(8);

    analytics.forEach(a => {
      const seller = a.sellerId || {};
      const order = a.orderId || {};

      const orderDetails = order.items
        ? order.items.map(item => item.product ? item.product.title : "Unknown").join(", ")
        : "-";

      if (y > 520) {
        doc.addPage({ layout: 'landscape', margin: 15 });
        y = 30;
      }

      doc.text(order._id ? order._id.toString() : "-", cols[0].x, y, { width: cols[0].w, ellipsis: true });
      doc.text(orderDetails, cols[1].x, y, { width: cols[1].w, ellipsis: true });
      doc.text(seller.shopName || "-", cols[2].x, y, { width: cols[2].w, ellipsis: true });
      doc.text(order.totalAmount || "0", cols[3].x, y);
      doc.text(a.totalCommissionPercentage || "0", cols[4].x, y);
      doc.text(a.platformCommission?.toFixed(1) || "0", cols[5].x, y);
      doc.text(a.sellerEarning?.toFixed(1) || "0", cols[6].x, y);
      doc.text(order.shippingCharge?.toFixed(1) || "0", cols[7].x, y); // Corrected
      doc.text(a.deliveryPartnerFee?.toFixed(1) || "0", cols[8].x, y);

      const status = a.deliveryPartnerFeeStatus === "COMPLETED" ? "Paid" : "Pending";
      doc.text(status, cols[9].x, y);

      y += 20;
    });

    doc.end();

  } catch (err) {
    console.error("Download PDF Error:", err);
    res.status(500).json({ message: "Failed to download PDF" });
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

const createOffer = async (req, res) => {
  try {
    const {
      code,
      provider,
      tagline,
      conditionType,
      conditionValue,
      active,
      minCartAmount,
      expiryDate,
      usageLimitPerBuyer,
      applicableCategories
    } = req.body;

    if (!code || !tagline || conditionValue === undefined) {
      return res.status(400).json({ message: "Code, Tagline and Condition Value are required" });
    }

    // Validate expiry date
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (expiry < today) {
        return res.status(400).json({
          message: "Expiry date must be today or in the future"
        });
      }
    }

    // Validate minCartAmount
    if (minCartAmount !== undefined && minCartAmount < 0) {
      return res.status(400).json({
        message: "Minimum cart amount cannot be negative"
      });
    }

    const existing = await Offer.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Offer code already exists" });
    }

    const offer = await Offer.create({
      provider: provider || "KETALOG OFFER",
      code: code.toUpperCase(),
      tagline,
      conditionType: conditionType || "flat",
      conditionValue: Number(conditionValue),
      minCartAmount: minCartAmount || 0,
      expiryDate: expiryDate || null,
      usageLimitPerBuyer: usageLimitPerBuyer || null,
      applicableCategories: applicableCategories || [],
      isActive: active !== undefined ? active : true
    });

    res.status(201).json(offer);
  } catch (err) {
    console.error("createOffer error:", err);
    res.status(500).json({ message: "Failed to create offer" });
  }
};

const getAllOffers = async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error("getAllOffers error:", err);
    res.status(500).json({ message: "Failed to fetch offers" });
  }
};

const getActiveOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ isActive: true })
      .select("code conditionValue conditionType tagline minCartAmount expiryDate applicableCategories usageHistory");
    res.json(offers);
  } catch (err) {
    console.error("getActiveOffers error:", err);
    res.status(500).json({ message: "Failed to fetch active offers" });
  }
};

const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    await Offer.findByIdAndDelete(id);
    res.json({ message: "Offer deleted successfully" });
  } catch (err) {
    console.error("deleteOffer error:", err);
    res.status(500).json({ message: "Failed to delete offer" });
  }
};

const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      provider,
      code,
      tagline,
      conditionType,
      conditionValue,
      minCartAmount,
      expiryDate,
      usageLimitPerBuyer,
      applicableCategories,
      isActive
    } = req.body;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ message: "Offer not found" });
    }

    // Validate expiry date if provided
    if (expiryDate !== undefined) {
      const expiry = new Date(expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (expiry < today) {
        return res.status(400).json({
          message: "Expiry date must be today or in the future"
        });
      }
    }

    // Validate usage limit if provided
    if (usageLimitPerBuyer !== undefined && usageLimitPerBuyer < 1) {
      return res.status(400).json({
        message: "Usage limit must be at least 1"
      });
    }

    // Validate minCartAmount if provided
    if (minCartAmount !== undefined && minCartAmount < 0) {
      return res.status(400).json({
        message: "Minimum cart amount cannot be negative"
      });
    }

    // Check if code is being changed and if it already exists
    if (code && code.toUpperCase() !== offer.code) {
      const existing = await Offer.findOne({ code: code.toUpperCase() });
      if (existing) {
        return res.status(400).json({ message: "Offer code already exists" });
      }
    }

    // Update fields
    if (provider !== undefined) offer.provider = provider;
    if (code !== undefined) offer.code = code.toUpperCase();
    if (tagline !== undefined) offer.tagline = tagline;
    if (conditionType !== undefined) offer.conditionType = conditionType;
    if (conditionValue !== undefined) offer.conditionValue = conditionValue;
    if (minCartAmount !== undefined) offer.minCartAmount = minCartAmount;
    if (expiryDate !== undefined) offer.expiryDate = expiryDate;
    if (usageLimitPerBuyer !== undefined) offer.usageLimitPerBuyer = usageLimitPerBuyer;
    if (applicableCategories !== undefined) offer.applicableCategories = applicableCategories;
    if (isActive !== undefined) offer.isActive = isActive;

    await offer.save();

    res.json({ message: "Offer updated successfully", offer });
  } catch (err) {
    console.error("updateOffer error:", err);
    res.status(500).json({ message: "Failed to update offer" });
  }
};


/* ---------------- VARIANT MANAGEMENT (ADMIN) ---------------- */
const getAllVariants = async (req, res) => {
  try {
    // Return all variants populated with product info
    const variants = await Variant.find().populate('product');
    res.json(variants);
  } catch (err) {
    console.error("admin getAllVariants error:", err);
    res.status(500).json({ message: "Failed to fetch all variants" });
  }
};

const updateVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const variant = await Variant.findByIdAndUpdate(id, updates, { new: true });
    if (!variant) return res.status(404).json({ message: "Variant not found" });

    res.json(variant);
  } catch (err) {
    console.error("admin updateVariant error:", err);
    res.status(500).json({ message: "Failed to update variant" });
  }
};

const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variant = await Variant.findByIdAndDelete(id);
    if (!variant) return res.status(404).json({ message: "Variant not found" });

    res.json({ message: "Variant deleted successfully" });
  } catch (err) {
    console.error("admin deleteVariant error:", err);
    res.status(500).json({ message: "Failed to delete variant" });
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
  downloadAnalyticsExcel,
  downloadAnalyticsPDF,
  updateAnalytics,
  createOffer,
  updateOffer,
  getAllOffers,
  getActiveOffers,
  deleteOffer,
  applyOffer,
  toggleOfferStatus,
  getAllVariants,
  updateVariant,
  deleteVariant
};
