// Quick fix to restart server with streaming routes
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 8891; // Use different port to avoid conflict

// Enable CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

// Add the streaming routes
console.log('🔧 Loading streaming routes...');
try {
  require("./routes/stream.route")(app);
  console.log('✅ Streaming routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading streaming routes:', error);
}

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date() });
});

// List all routes
app.get('/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      routes.push(`${methods} ${middleware.route.path}`);
    }
  });
  res.json({ routes });
});

app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`📋 Test streaming URL: http://localhost:${PORT}/api/v1/stream/course-image/6895a124640829b294034fa0`);
  console.log(`📋 Routes list: http://localhost:${PORT}/routes`);
});
