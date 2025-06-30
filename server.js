const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// MongoDB connection
const uri = "mongodb+srv://mathewharvey:Bongos4u@lifeinweekscluster.atuq9hl.mongodb.net/?retryWrites=true&w=majority&appName=LifeInWeeksCluster";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database
async function initDB() {
  try {
    await client.connect();
    const db = client.db("filterTracker");
    const filters = db.collection("filters");
    
    // Initialize 4 filters if they don't exist
    const count = await filters.countDocuments();
    if (count === 0) {
      const defaultFilters = [1, 2, 3, 4].map(id => ({
        id: id,
        name: `Filter ${id}`,
        location: "Storage",
        uvCapability: true,
        tenMicronCapability: true,
        bookings: [],
        notes: "",
        serviceFrequencyDays: 90, // Default 90 days
        lastServiceDate: null
      }));
      await filters.insertMany(defaultFilters);
    }
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// Routes
app.get('/api/filters', async (req, res) => {
  try {
    const db = client.db("filterTracker");
    const filters = await db.collection("filters").find({}).toArray();
    res.json(filters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/filters/:id', async (req, res) => {
  try {
    const db = client.db("filterTracker");
    const filterId = parseInt(req.params.id);
    await db.collection("filters").updateOne(
      { id: filterId },
      { $set: req.body }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});