const mongoose = require('mongoose');
const KatniLocation = require('./src/models/KatniLocation');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const seed = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/b2c_marketplace';
        console.log("Connecting to:", uri);
        await mongoose.connect(uri);
        console.log("Connected to DB");

        const jsonPath = path.join(__dirname, '..', 'katni_locations.json');
        if (!fs.existsSync(jsonPath)) {
            console.error("JSON file not found at", jsonPath);
            process.exit(1);
        }
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const locations = JSON.parse(rawData);

        let count = 0;
        for (const loc of locations) {
            await KatniLocation.findOneAndUpdate(
                { area: loc.area },
                { ...loc, district: "Katni", state: "Madhya Pradesh" },
                { upsert: true, new: true }
            );
            count++;
        }

        console.log(`Seeded/Updated ${count} locations to ${uri}`);
        process.exit(0);
    } catch (err) {
        console.error("Seed Error:", err);
        process.exit(1);
    }
};

seed();
