const Redis = require('ioredis');
require('dotenv').config();

let isRedisAvailable = false;

const redisClient = new Redis(process.env.REDIS_URL, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        if (times > 10) {
            console.error('❌ Redis Test Client: Max reconnection attempts reached');
            return null; // Stop retrying
        }
        console.log(`🔄 Redis Test Client: Reconnecting in ${delay}ms (attempt ${times})...`);
        return delay;
    },
    reconnectOnError: (err) => {
        const isDnsError = err.code === 'EAI_AGAIN' || err.message?.includes('getaddrinfo');
        if (isDnsError) {
            console.warn('⚠️ Redis Test Client: DNS error, will retry...');
            return true; // Retry on DNS errors
        }
        // Don't retry on other errors
        return false;
    },
    connectTimeout: 15000,
    lazyConnect: false
});

redisClient.on('connect', () => {
    console.log('✅ Redis Test Client connected');
    isRedisAvailable = true;
});

redisClient.on('ready', () => {
    console.log('🚀 Redis Test Client ready');
    isRedisAvailable = true;
});

redisClient.on('error', (err) => {
    const isDnsError = err.code === 'EAI_AGAIN' || err.message?.includes('getaddrinfo');
    if (isDnsError) {
        console.warn('⚠️ Redis Test Client DNS error (non-fatal):', err.hostname || 'unknown host');
    } else {
        console.error('❌ Redis Test Client error:', err.message || err);
    }
    isRedisAvailable = false;
});

redisClient.on('reconnecting', () => {
    console.log('🔄 Redis Test Client reconnecting...');
    isRedisAvailable = false;
});

redisClient.on('close', () => {
    console.log('🔌 Redis Test Client connection closed');
    isRedisAvailable = false;
});

// Export helper function
redisClient.isAvailable = () => isRedisAvailable;

module.exports = redisClient;