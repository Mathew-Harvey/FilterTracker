if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

require('dotenv').config();
console.log('Environment variables loaded. MONGODB_URI defined:', !!process.env.MONGODB_URI);
const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is not set');
  console.error('Please check that your .env file exists and contains MONGODB_URI=your_connection_string');
  process.exit(1);
}
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
    const accessories = db.collection("accessories");
    
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

    // Initialize accessories if they don't exist
    const accessoryCount = await accessories.countDocuments();
    if (accessoryCount === 0) {
      const defaultAccessories = [
        // NSW Pool
        { id: 1, name: "Trash pump", pool: "NSW", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 2, name: "Large Hydraulic power unit", pool: "NSW", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 3, name: "100m length of 100mm tiger tail hose", pool: "NSW", quantity: 1, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 4, name: "Rapid reel", pool: "NSW", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 5, name: "15m length of 50mm floating tiger tail hose", pool: "NSW", quantity: 2, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 2 },
        { id: 6, name: "15m length of 75mm floating tiger tail hose", pool: "NSW", quantity: 2, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 2 },
        { id: 7, name: "75mm camlock fitting funnel hand tools", pool: "NSW", quantity: 6, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 8, name: "100mm to 2x50mm camlock t-piece", pool: "NSW", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 9, name: "100mm to 2x75mm camlock t-piece", pool: "NSW", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 31, name: "Filter power cable", pool: "NSW", quantity: 1, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        
        // WA Pool
        { id: 10, name: "Large Trash pump", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 12, name: "3/4 inch hydrolic leads", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 13, name: "Small trash pump", pool: "WA", quantity: 2, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 14, name: "1/2 inch hydrolic leads", pool: "WA", quantity: 2, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 15, name: "Small hydraulic power unit", pool: "WA", quantity: 2, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 16, name: "Spill bund mat", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 17, name: "Hydraulic power unit", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 18, name: "100m length of 100mm tiger tail hose", pool: "WA", quantity: 1, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 19, name: "Rapid reel", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 20, name: "15m length of 50mm floating tiger tail hose", pool: "WA", quantity: 2, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 2 },
        { id: 21, name: "15m length of 75mm floating tiger tail hose", pool: "WA", quantity: 2, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 2 },
        { id: 22, name: "75mm camlock fitting funnel hand tool", pool: "WA", quantity: 3, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 23, name: "50mm camlock fitting funnel hand tool", pool: "WA", quantity: 3, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 24, name: "100mm to 2x50mm camlock t-piece", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 25, name: "100mm to 2x75mm camlock t-piece", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 26, name: "100mm inline sampling t-piece", pool: "WA", quantity: 2, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 27, name: "50mm push hand tools", pool: "WA", quantity: 4, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 28, name: "50mm pull hand tools", pool: "WA", quantity: 4, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 },
        { id: 29, name: "75mm camlock blanking caps", pool: "WA", quantity: 2, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 30, name: "Step Ladder", pool: "WA", quantity: 1, notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: false, requiredPerBooking: 1 },
        { id: 32, name: "Filter power cable", pool: "WA", quantity: 1, unit: "", notes: "", allocatedFilters: [], outOfService: { isOutOfService: false, startDate: null, endDate: null, reason: "" }, isCritical: true, requiredPerBooking: 1 }
      ];
      await accessories.insertMany(defaultAccessories);
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

// Accessory Routes
app.get('/api/accessories', async (req, res) => {
  try {
    const db = client.db("filterTracker");
    const accessories = await db.collection("accessories").find({}).toArray();
    res.json(accessories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accessories', async (req, res) => {
  try {
    const db = client.db("filterTracker");
    const accessories = await db.collection("accessories").find({}).sort({ id: -1 }).limit(1).toArray();
    const newId = accessories.length > 0 ? accessories[0].id + 1 : 1;
    
    const newAccessory = {
      id: newId,
      name: req.body.name,
      pool: req.body.pool,
      quantity: req.body.quantity,
      unit: req.body.unit || "",
      notes: req.body.notes || "",
      allocatedFilters: [],
      outOfService: req.body.outOfService || [],
      isCritical: req.body.isCritical || false,
      requiredPerBooking: req.body.requiredPerBooking || 1
    };
    
    await db.collection("accessories").insertOne(newAccessory);
    res.json({ success: true, accessory: newAccessory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/accessories/:id', async (req, res) => {
  try {
    const db = client.db("filterTracker");
    const accessoryId = parseInt(req.params.id);
    await db.collection("accessories").updateOne(
      { id: accessoryId },
      { $set: req.body }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accessories/:id', async (req, res) => {
  try {
    const db = client.db("filterTracker");
    const accessoryId = parseInt(req.params.id);
    await db.collection("accessories").deleteOne({ id: accessoryId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available accessories for a specific filter and date range
app.post('/api/accessories/available', async (req, res) => {
  try {
    const { filterId, startDate, endDate } = req.body;
    function getDatesInRange(start, end) {
      const dates = [];
      let current = new Date(start);
      const endDate = new Date(end);
      while (current <= endDate) {
        dates.push(new Date(current).toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
      return dates;
    }
    const allDates = getDatesInRange(startDate, endDate);
    const db = client.db("filterTracker");
    
    // Get all accessories
    const accessories = await db.collection("accessories").find({}).toArray();
    
    // Get all filters to check their bookings
    const filters = await db.collection("filters").find({}).toArray();
    
    // Filter accessories based on pool restrictions
    let availableAccessories = accessories.filter(accessory => {
      if (accessory.pool === "NSW") {
        return filterId === 4; // NSW pool only for filter 4
      } else if (accessory.pool === "WA") {
        return [1, 2, 3].includes(filterId); // WA pool for filters 1, 2, 3
      }
      return false;
    });

    // Check availability for the date range
    availableAccessories = availableAccessories.map(accessory => {
      let allocatedCount = 0;
      let isOutOfServiceDuringPeriod = false;
      const dailyAllocations = new Map();
      
      // Check allocations across all filters for the date range
      filters.forEach(filter => {
        if (filter.bookings) {
          filter.bookings.forEach(booking => {
            const bookingDate = new Date(booking.date);
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // Only count bookings that fall within our requested date range
            if (bookingDate >= start && bookingDate <= end && booking.accessories) {
              const allocation = booking.accessories.find(a => a.id === accessory.id);
              if (allocation) {
                const dateKey = booking.date;
                const currentAllocation = dailyAllocations.get(dateKey) || 0;
                dailyAllocations.set(dateKey, currentAllocation + allocation.quantity);
              }
            }
          });
        }
      });
      
      allocatedCount = dailyAllocations.size > 0 ? Math.max(...dailyAllocations.values()) : 0;
      const outOfService = Array.isArray(accessory.outOfService) ? accessory.outOfService : (accessory.outOfService && accessory.outOfService.isOutOfService ? [{quantity: accessory.quantity, startDate: accessory.outOfService.startDate, endDate: accessory.outOfService.endDate, reason: accessory.outOfService.reason}] : []);
      let minAvailable = Infinity;
      isOutOfServiceDuringPeriod = false;
      for (const date of allDates) {
        let outThatDay = 0;
        outOfService.forEach(os => {
          const osStart = new Date(os.startDate);
          const osEnd = new Date(os.endDate);
          const currentDate = new Date(date);
          if (osStart <= currentDate && currentDate <= osEnd) {
            outThatDay += os.quantity || 1;
          }
        });
        if (outThatDay > 0) isOutOfServiceDuringPeriod = true;
        const allocatedThatDay = dailyAllocations.get(date) || 0;
        const availableThatDay = accessory.quantity - outThatDay - allocatedThatDay;
        minAvailable = Math.min(minAvailable, availableThatDay);
      }
      const availableQuantity = Math.max(0, minAvailable);
      
      return {
        ...accessory,
        availableQuantity,
        allocatedCount,
        isOutOfServiceDuringPeriod
      };
    });

    res.json(availableAccessories);
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