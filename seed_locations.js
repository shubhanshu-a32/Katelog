const mongoose = require('mongoose');
const KatniLocation = require('./src/models/KatniLocation');
require('dotenv').config(); // Load env for Mongo URI

const locations = [
    // 483501
    ...["Ghantaghar", "Nehru Market", "Gole Bazar", "Subhash Chowk", "Juniani", "Barahi", "Bhatta Mohalla", "Purani Basti", "Civil Lines", "Bus Stand Area", "Katangi Road", "Railway Station Area"]
        .map(area => ({ area, pincode: 483501 })),

    // 483504
    ...["Katni Junction", "Madan Mahal", "Tilak Nagar", "Jawahar Nagar", "Gandhi Nagar", "Indira Colony", "Shivaji Nagar", "Madhav Nagar", "Saraswati Nagar"]
        .map(area => ({ area, pincode: 483504 })),

    // 483503
    ...["New Katni", "Vijay Nagar", "Palasia", "Shanti Nagar", "Durga Colony", "Ram Manohar Lohia Nagar", "Krishna Nagar", "Sanjay Gandhi Nagar", "Azad Nagar", "Vivekanand Nagar", "Patel Nagar", "Rani Durgavati Nagar", "Laxmi Nagar", "Ambedkar Nagar", "New Ram Nagar", "Hanuman Nagar", "Gayatri Nagar", "Balaji Nagar", "Nayagaon"]
        .map(area => ({ area, pincode: 483503 }))
];

const seed = async () => {
    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/ecom"); // Hardcoded local or use env
        // Using process.env.MONGODB_URI if available, else local
        // const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ecom";
        // await mongoose.connect(uri);

        console.log("Connected to DB");

        // Clear existing? User didn't say, but to ensure clean seed...
        // Maybe better to upsert.

        for (const loc of locations) {
            // Upsert to match user request "locations that are to be added"
            await KatniLocation.findOneAndUpdate(
                { area: loc.area },
                { ...loc, district: "Katni", state: "Madhya Pradesh" },
                { upsert: true, new: true }
            );
        }

        console.log(`Seeded ${locations.length} locations`);
        process.exit(0);
    } catch (err) {
        console.error("Seed Error:", err);
        process.exit(1);
    }
};

seed();
