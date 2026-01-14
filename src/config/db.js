// const mongoose = require('mongoose');

// const connectDB = async (uri) => {
//     try {
//         await mongoose.connect(uri, {
//             dbName: 'b2c_marketplace',
//             serverSelectionTimeoutMS: 5000
//         });
//         mongoose.set('bufferCommands', false);
//         console.log('🚀 MongoDB connected');
//     } catch (err) {
//         console.log('MongoDB connection error:', err);
//         throw err;
//     }
// };

// module.exports = { connectDB };

// src/config/db.js
'use strict';

const mongoose = require('mongoose');

module.exports = async function connectDB(uri) {
    if (!uri || typeof uri !== 'string') {
        throw new Error('Mongo URI missing/invalid in connectDB(uri)');
    }

    mongoose.set('strictQuery', true);

    await mongoose.connect(uri, {
        // These options are fine for modern mongoose; safe to keep minimal
    });

    console.log('✅ MongoDB connected');
};