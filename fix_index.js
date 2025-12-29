const mongoose = require('mongoose');
require('dotenv').config();

const fixIndex = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/b2c_marketplace';
        console.log("Connecting to:", uri);
        await mongoose.connect(uri);
        console.log("Connected to DB");

        const collection = mongoose.connection.collection('katnilocations');

        // Check indexes
        const indexes = await collection.indexes();
        console.log("Current indexes:", indexes);

        // Drop pincode_1 if exists
        const pinterestIndex = indexes.find(idx => idx.name === 'pincode_1');
        if (pinterestIndex) {
            console.log("Dropping pincode_1 index...");
            await collection.dropIndex('pincode_1');
            console.log("Dropped pincode_1 index");
        } else {
            console.log("pincode_1 index not found");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
};

fixIndex();
