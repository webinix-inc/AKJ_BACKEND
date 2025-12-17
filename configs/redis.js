const redis = require('redis');
require('dotenv').config();

let isRedisAvailable = false;
let connectionRetries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

/**
 * Retry connection with exponential backoff
 */
const retryConnection = async (connectFn, clientName) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await connectFn();
      console.log(`✅ ${clientName} connected successfully on attempt ${attempt}`);
      connectionRetries = 0; // Reset on success
      return true;
    } catch (err) {
      const isDnsError = err.code === 'EAI_AGAIN' || err.syscall === 'getaddrinfo';
      
      if (isDnsError) {
        console.warn(`⚠️ ${clientName} DNS resolution failed (attempt ${attempt}/${MAX_RETRIES}):`, err.hostname || 'unknown host');
      } else {
        console.warn(`⚠️ ${clientName} connection failed (attempt ${attempt}/${MAX_RETRIES}):`, err.message);
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`🔄 Retrying ${clientName} connection in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`❌ ${clientName} connection failed after ${MAX_RETRIES} attempts`);
        isRedisAvailable = false;
        return false;
      }
    }
  }
  return false;
};

const createRedisClient = (clientName = 'Redis Client') => {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 15000, // Increased timeout
      readTimeout: 15000,
      keepAlive: 30000,
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error(`❌ ${clientName}: Max reconnection attempts reached`);
          return new Error('Max reconnection attempts reached');
        }
        const delay = Math.min(retries * 100, 3000); // Max 3 seconds delay
        console.log(`🔄 ${clientName}: Reconnecting in ${delay}ms (attempt ${retries})...`);
        return delay;
      }
    }
  });

  client.on('error', (err) => {
    const isDnsError = err.code === 'EAI_AGAIN' || err.syscall === 'getaddrinfo';
    if (isDnsError) {
      console.warn(`⚠️ ${clientName} DNS error (non-fatal):`, err.hostname || 'unknown host');
      isRedisAvailable = false;
    } else {
      console.error(`❌ ${clientName} error:`, err.message || err);
      isRedisAvailable = false;
    }
  });

  client.on('connect', () => {
    console.log(`✅ ${clientName} connected`);
    isRedisAvailable = true;
    connectionRetries = 0;
  });

  client.on('ready', () => {
    console.log(`🚀 ${clientName} ready`);
    isRedisAvailable = true;
  });

  client.on('reconnecting', () => {
    console.log(`🔄 ${clientName} reconnecting...`);
    isRedisAvailable = false;
  });

  client.on('end', () => {
    console.log(`🔌 ${clientName} connection ended`);
    isRedisAvailable = false;
  });

  return client;
};

const redisClient = createRedisClient('Redis Client');
const redisSubscriber = createRedisClient('Redis Subscriber');

// Initialize connections with retry logic
(async () => {
  try {
    const clientConnected = await retryConnection(
      () => redisClient.connect(),
      'Redis Client'
    );
    
    const subscriberConnected = await retryConnection(
      () => redisSubscriber.connect(),
      'Redis Subscriber'
    );

    if (clientConnected && subscriberConnected) {
      console.log('✅ All Redis clients connected successfully');
      isRedisAvailable = true;
    } else {
      console.warn('⚠️ Some Redis clients failed to connect. App will continue with limited functionality.');
      isRedisAvailable = false;
    }
  } catch (err) {
    console.error('❌ Critical error during Redis initialization:', err.message);
    isRedisAvailable = false;
  }
})();

const disconnectRedis = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.disconnect();
    }
    if (redisSubscriber && redisSubscriber.isOpen) {
      await redisSubscriber.disconnect();
    }
    console.log('✅ All Redis clients disconnected successfully');
    isRedisAvailable = false;
  } catch (err) {
    console.error('❌ Error disconnecting from Redis:', err.message);
  }
};

// Helper function to check if Redis is available
const isRedisConnected = () => {
  return isRedisAvailable && 
         redisClient?.isOpen && 
         redisSubscriber?.isOpen;
};

module.exports = { 
  redisClient, 
  redisSubscriber, 
  disconnectRedis,
  isRedisConnected,
  isRedisAvailable: () => isRedisAvailable
};