const Category = require('../models/Category');

const createCategory = async (req, res) => {
  const { name, parent } = req.body;
  if (!name) return res.status(400).json({ message: 'name required' });
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  try {
    const existing = await Category.findOne({ slug });
    if (existing) return res.status(400).json({ message: 'Category already exists' });
    const cat = await Category.create({ title: name, slug, parent: parent || null });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ message: 'Error creating category', error: err.message });
  }
};

const SubCategory = require("../models/SubCategory");

const listCategories = async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const subCategories = await SubCategory.find().lean();

    const categoryList = categories.map(cat => {
      const subs = subCategories.filter(sub => sub.category.toString() === cat._id.toString());
      return {
        _id: cat._id,
        name: cat.title,
        slug: cat.slug,
        subCategories: subs.map(sub => ({
          _id: sub._id,
          name: sub.title,
          slug: sub.slug,
          category: sub.category
        }))
      };
    });

    res.json(categoryList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


module.exports = { createCategory, listCategories };