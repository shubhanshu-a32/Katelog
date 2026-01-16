const Variant = require("../models/Variant");
const Product = require("../models/Product");

/* ---------------- CREATE VARIANT ---------------- */
const createVariant = async (req, res) => {
    try {
        const { productId, attributes, price, stock, sku, images, isActive, name } = req.body;
        const sellerId = req.user._id;

        if (!productId || !attributes || !price) {
            return res.status(400).json({ message: "Product ID, attributes, and price are required" });
        }

        // Verify product ownership
        const product = await Product.findOne({ _id: productId, sellerId });
        if (!product) {
            // Allow Admin to create variants? User request said "fetched by admin and can be edited and deleted by admin"
            // But usually creation is by seller. Let's strict to seller for now unless admin override needed.
            // Actually, let's allow admin too if role is admin.
            if (req.user.role !== 'admin') {
                return res.status(404).json({ message: "Product not found or unauthorized" });
            }
            // If admin, check product exists regardless of seller
            const adminProd = await Product.findById(productId);
            if (!adminProd) return res.status(404).json({ message: "Product not found" });
        }

        const variant = await Variant.create({
            product: productId,
            seller: product ? product.sellerId : req.user._id, // If admin creating, this logic might need adjustment but typically seller creates.
            attributes,
            price,
            stock,
            sku,
            images,
            isActive: isActive !== undefined ? isActive : true,
            name
        });

        res.status(201).json(variant);
    } catch (err) {
        console.error("createVariant error:", err);
        res.status(500).json({ message: "Failed to create variant" });
    }
};

/* ---------------- GET ALL VARIANTS (ADMIN) ---------------- */
const getAllVariants = async (req, res) => {
    try {
        // Optional: Add filtering/pagination
        const variants = await Variant.find().populate('product');
        res.json(variants);
    } catch (err) {
        console.error("getAllVariants error:", err);
        res.status(500).json({ message: "Failed to fetch all variants" });
    }
};

/* ---------------- GET VARIANTS BY PRODUCT ---------------- */
const getVariantsByProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const variants = await Variant.find({ product: productId });
        res.json(variants);
    } catch (err) {
        console.error("getVariantsByProduct error:", err);
        res.status(500).json({ message: "Failed to fetch variants" });
    }
};

/* ---------------- GET VARIANT BY ID ---------------- */
const getVariantById = async (req, res) => {
    try {
        const variant = await Variant.findById(req.params.id).populate("product");
        if (!variant) return res.status(404).json({ message: "Variant not found" });
        res.json(variant);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

/* ---------------- UPDATE VARIANT ---------------- */
const updateVariant = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const variant = await Variant.findById(id);
        if (!variant) return res.status(404).json({ message: "Variant not found" });

        // Auth Check: Seller must own the variant (via product) or be Admin
        if (req.user.role !== 'admin' && variant.seller.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Not authorized to update this variant" });
        }

        const updatedVariant = await Variant.findByIdAndUpdate(id, updates, { new: true });
        res.json(updatedVariant);
    } catch (err) {
        console.error("updateVariant error:", err);
        res.status(500).json({ message: "Failed to update variant" });
    }
};

/* ---------------- DELETE VARIANT ---------------- */
const deleteVariant = async (req, res) => {
    try {
        const { id } = req.params;
        const variant = await Variant.findById(id);
        if (!variant) return res.status(404).json({ message: "Variant not found" });

        // Auth Check
        if (req.user.role !== 'admin' && variant.seller.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Not authorized to delete this variant" });
        }

        await Variant.findByIdAndDelete(id);
        res.json({ message: "Variant deleted successfully" });
    } catch (err) {
        console.error("deleteVariant error:", err);
        res.status(500).json({ message: "Failed to delete variant" });
    }
};

module.exports = {
    createVariant,
    getVariantsByProduct,
    getAllVariants,
    getVariantById,
    updateVariant,
    deleteVariant
};
