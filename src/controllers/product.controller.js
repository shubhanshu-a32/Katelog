const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const { paginate } = require("../utils/pagination");

const slugify = (str = "") =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

/* ---------------- CREATE PRODUCT (SELLER) ---------------- */
const createProduct = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const {
      title,
      description,
      price,
      stock = 0,
      specs = {},
      commission = 0,
      category,
      subcategory,
      images = [],
    } = req.body;

    if (!title || price === undefined) {
      return res.status(400).json({ message: "Title and price are required" });
    }

    if (Number(price) < 0 || Number(stock) < 0) {
      return res.status(400).json({ message: "Invalid price or stock" });
    }

    if (Number(commission) < 0 || Number(commission) > 100) {
      return res.status(400).json({ message: "Commission must be between 0 and 100" });
    }

    // Resolve category/subcategory slugs to ObjectIds when the frontend sends strings like "electronics", "mobiles"
    let categoryId = category;
    if (!mongoose.Types.ObjectId.isValid(category)) {
      let catDoc =
        (await Category.findOne({ slug: category })) ||
        (await Category.findOne({ title: category?.toUpperCase() }));

      // Auto-create category if not present to avoid hard failures during product creation
      if (!catDoc) {
        catDoc = await Category.create({
          title: category?.toUpperCase(),
          slug: slugify(category),
        });
      }

      categoryId = catDoc._id;
    }

    let subcategoryId = subcategory;
    if (!mongoose.Types.ObjectId.isValid(subcategory)) {
      let subDoc =
        (await SubCategory.findOne({
          slug: subcategory,
          category: categoryId,
        })) ||
        (await SubCategory.findOne({
          title: subcategory?.toUpperCase(),
          category: categoryId,
        }));

      // Auto-create subcategory if not present
      if (!subDoc) {
        subDoc = await SubCategory.create({
          title: subcategory?.toUpperCase(),
          slug: slugify(subcategory),
          category: categoryId,
        });
      }

      subcategoryId = subDoc._id;
    }

    const product = await Product.create({
      sellerId,
      title,
      description,
      price: Number(price),
      stock: Number(stock),
      commission: Number(commission),
      category: categoryId,
      subcategory: subcategoryId,
      images,
      specs: {
        size: specs.size,
        color: specs.color,
        weight: specs.weight ? Number(specs.weight) : undefined,
        weightUnit: specs.weightUnit || 'kg'
      },
      sellerName: req.user.shopName || req.user.fullName,
    });

    res.status(201).json(product);
  } catch (err) {
    console.error("createProduct error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- IMAGE UPLOAD ---------------- */
const uploadImages = async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ message: "No images uploaded" });
    }

    const urls = req.files.map((file) => {
      // For Cloudinary storage, file.path is already a full URL
      if (file.path && file.path.startsWith("http")) {
        return file.path;
      }

      // For local disk storage fallback, build a URL that the frontend can use directly
      const filename = file.filename || (file.path ? file.path.split("/").pop() : "");
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      return `${baseUrl}/uploads/${filename}`;
    });

    res.json({ images: urls });
  } catch (err) {
    console.error("uploadImages error:", err);
    res.status(500).json({ message: "Image upload failed" });
  }
};

/* ---------------- UPDATE PRODUCT ---------------- */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user._id;

    const product = await Product.findOne({ _id: id, sellerId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    Object.assign(product, req.body);
    await product.save();

    res.json(product);
  } catch (err) {
    console.error("updateProduct error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- DELETE PRODUCT ---------------- */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user._id;

    const product = await Product.findOneAndDelete({ _id: id, sellerId });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("deleteProduct error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET SINGLE PRODUCT ---------------- */
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "sellerId",
      "mobile shopName address lat lng"
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("getProduct error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET SELLER PRODUCTS (SECURE) ---------------- */
const getProductsBySeller = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const sellerId = req.user._id;

    const query = { sellerId };
    const sort = { createdAt: -1 };

    const data = await paginate(Product.find(query).sort(sort), { page, limit });
    res.json(data);
  } catch (err) {
    console.error("getProductsBySeller error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- LIST PRODUCTS (SHOP) ---------------- */
const listProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      q,
      category,
      subcategory,
      maxPrice,
      inStock,
      seller,
    } = req.query;

    const filter = {};

    if (seller) {
      filter.sellerId = seller;
    }

    if (q) {
      filter.title = { $regex: q, $options: "i" };
    }

    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        const catDoc =
          (await Category.findOne({ slug: category })) ||
          (await Category.findOne({ title: category.toUpperCase() }));
        if (catDoc) filter.category = catDoc._id;
      }
    }

    if (subcategory) {
      if (mongoose.Types.ObjectId.isValid(subcategory)) {
        filter.subcategory = subcategory;
      } else {
        const subDoc =
          (await SubCategory.findOne({ slug: subcategory })) ||
          (await SubCategory.findOne({ title: subcategory.toUpperCase() }));
        if (subDoc) filter.subcategory = subDoc._id;
      }
    }

    if (maxPrice) {
      filter.price = { $lte: Number(maxPrice) };
    }

    if (inStock === "true") {
      filter.stock = { $gt: 0 };
    }

    // Exclude disabled products
    filter.status = { $ne: "DISABLED" };

    // Location-based filtering
    if (req.query.pincode || req.query.area) {
      const SellerProfile = require("../models/SellerProfile");
      const locationFilter = {};

      // If pincode is provided, prioritize it for broader matching (e.g. all areas in 483501)
      if (req.query.pincode) {
        locationFilter.pincode = Number(req.query.pincode);
      } else if (req.query.area) {
        // Fallback to area search if no pincode
        locationFilter.area = { $regex: req.query.area, $options: "i" };
      }

      // Find sellers matching the location
      const matchingSellers = await SellerProfile.find(locationFilter).select("userId");
      const sellerIds = matchingSellers.map(s => s.userId);

      // If sellers are found, filter products by these sellers
      if (sellerIds.length > 0) {
        // If a seller filter was already applied, we need to find the intersection
        if (filter.sellerId) {
          // If the specifically requested seller is not in the location match, result is empty
          if (!sellerIds.some(id => id.toString() === filter.sellerId.toString())) {
            return res.json({ data: [], total: 0, limit, page, pages: 0 });
          }
          // Otherwise, filter.sellerId is already set to the specific seller, which is valid
        } else {
          filter.sellerId = { $in: sellerIds };
        }
      } else {
        // If no sellers match the location, return empty result
        return res.json({ data: [], total: 0, limit, page, pages: 0 });
      }
    }

    const query = Product.find(filter)
      .sort({ createdAt: -1 })
      .populate("subcategory", "title slug");

    const data = await paginate(query, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json(data);
  } catch (err) {
    console.error("listProducts error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const Review = require("../models/Review");

/* ---------------- ADD REVIEW ---------------- */
const addProductReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.id;
    const userId = req.user._id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const alreadyReviewed = await Review.findOne({
      productId,
      userId,
    });

    if (alreadyReviewed) {
      return res.status(400).json({ message: "Product already reviewed" });
    }

    const review = await Review.create({
      productId,
      userId,
      rating: Number(rating),
      comment,
    });

    // Update product stats
    const reviews = await Review.find({ productId });
    const numReviews = reviews.length;
    const avgRating =
      reviews.reduce((acc, item) => item.rating + acc, 0) / reviews.length;

    product.rating = avgRating;
    product.numReviews = numReviews;
    await product.save();

    res.status(201).json({ message: "Review added", review });
  } catch (err) {
    console.error("addProductReview error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------- GET REVIEWS ---------------- */
const getProductReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.id })
      .populate("userId", "fullName")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err) {
    console.error("getProductReviews error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProduct,
  uploadImages,
  updateProduct,
  deleteProduct,
  getProduct,
  getProductsBySeller,
  listProducts,
  addProductReview,
  getProductReviews,
};

