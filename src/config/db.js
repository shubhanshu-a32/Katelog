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