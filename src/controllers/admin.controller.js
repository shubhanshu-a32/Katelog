const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");

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

module.exports = {
  getStats,
  getAllUsers,
  deleteUser,
  getAllSellers,
  deleteSeller,
  createUser,
  addCategory,
  addSubCategory,
  deleteCategory,
  deleteSubCategory
};