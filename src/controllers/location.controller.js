const KatniLocation = require("../models/KatniLocation");

// Get all locations
const getLocations = async (req, res) => {
  try {
    const locations = await KatniLocation.find().sort({ area: 1 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch locations" });
  }
};

// Add a location (Admin)
const addLocation = async (req, res) => {
  try {
    const { area, pincode, district, state } = req.body;
    if (!area || !pincode) return res.status(400).json({ message: "Area and Pincode are required" });

    const existing = await KatniLocation.findOne({ pincode });
    if (existing) return res.status(400).json({ message: "Pincode already exists" });

    const location = await KatniLocation.create({ area, pincode, district, state });
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ message: "Failed to add location" });
  }
};

// Delete location
const deleteLocation = async (req, res) => {
  try {
    const { id } = req.params;
    await KatniLocation.findByIdAndDelete(id);
    res.json({ message: "Location deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete location" });
  }
};

module.exports = {
  getLocations,
  addLocation,
  deleteLocation
};