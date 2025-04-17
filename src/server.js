// Add this at the VERY TOP of your file
if (process.env.VERCEL) {
  process.env.DATABASE_URL = "file:/tmp/dev.db";
  // Copy database file to /tmp (vercel's writable directory)
  const fs = require('fs');
  if (fs.existsSync('prisma/dev.db')) {
    fs.copyFileSync('prisma/dev.db', '/tmp/dev.db');
  }
}




const path = require('path'); // Add this

require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const qs = require('qs');

const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



// Enable CORS for all routes
app.use(cors({
  origin: ['http://localhost:3000', 'https://delhivery.carboncraft.in'], // Add your production frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// POST endpoint
app.post('/api/shipments', async (req, res) => {
  try {
    // 1. Get the shipment data from frontend
    const shipmentData = req.body;

    // 2. Prepare for Delhivery API (critical part)
    const delhiveryData = {
      format: 'json',
      data: JSON.stringify(shipmentData)
    };

    // 3. Convert to URL-encoded format
    const delhiveryPayload = qs.stringify(delhiveryData, {
      encode: false // Important to prevent double encoding
    });

    // 4. Call Delhivery API
    const response = await axios.post(
      'https://track.delhivery.com/api/cmu/create.json',
      delhiveryPayload,
      {
        headers: {
          'Authorization': `Token ${process.env.DELHIVERY_AUTH_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    // 5. Save to database
    const createdShipment = await prisma.shipment.create({
      data: {
        waybill: response.data.packages[0].waybill,
        orderId: shipmentData.shipments[0].order,
        status: response.data.packages[0].status,
        pickupAddress: shipmentData.pickup_location,
        shipmentData: shipmentData.shipments[0],
        responseData: response.data
      }
    });

    // 6. Return success response
    res.status(201).json({
      success: true,
      shipment: createdShipment,
      delhiveryResponse: response.data
    });

  } catch (error) {
    console.error('Full error:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// GET endpoint
app.get('/api/shipments', async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany();
    res.json({ success: true, shipments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});