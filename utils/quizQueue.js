require('dotenv').config();

const Queue = require('bull');
const Redis = require('ioredis');
// const Redis = require('redis');

// Redis connection configuration with retry logic
const redisConfig = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        if (times > 10) {
            console.error('❌ Quiz Queue Redis: Max reconnection attempts reached');
            return null; // Stop retrying
        }
        console.log(`🔄 Quiz Queue Redis: Reconnecting in ${delay}ms (attempt ${times})...`);
        return delay;
    },
    reconnectOnError: (err) => {
        const isDnsError = err.code === 'EAI_AGAIN' || err.message?.includes('getaddrinfo');
        if (isDnsError) {
            console.warn('⚠️ Quiz Queue Redis: DNS error, will retry...');
            return true; // Retry on DNS errors
        }
        // Don't retry on other errors
        return false;
    },
    connectTimeout: 15000,
    lazyConnect: false
};

// Create a new Redis client
const redisClient = new Redis(process.env.REDIS_URL, redisConfig);
const redisSubscriber = new Redis(process.env.REDIS_URL, redisConfig);

redisClient.on('connect', () => {
    console.log('✅ Quiz Queue Redis Client connected');
});
redisSubscriber.on('connect', () => {
    console.log('✅ Quiz Queue Redis Subscriber connected');
});

redisClient.on('ready', () => {
    console.log('🚀 Quiz Queue Redis Client ready');
});

redisSubscriber.on('ready', () => {
    console.log('🚀 Quiz Queue Redis Subscriber ready');
});

redisClient.on('error', (error) => {
    const isDnsError = error.code === 'EAI_AGAIN' || error.message?.includes('getaddrinfo');
    if (isDnsError) {
        console.warn('⚠️ Quiz Queue Redis Client DNS error (non-fatal):', error.hostname || 'unknown host');
    } else {
        console.error('❌ Quiz Queue Redis Client error:', error.message || error);
    }
});

redisSubscriber.on('error', (error) => {
    const isDnsError = error.code === 'EAI_AGAIN' || error.message?.includes('getaddrinfo');
    if (isDnsError) {
        console.warn('⚠️ Quiz Queue Redis Subscriber DNS error (non-fatal):', error.hostname || 'unknown host');
    } else {
        console.error('❌ Quiz Queue Redis Subscriber error:', error.message || error);
    }
});

redisClient.on('reconnecting', () => {
    console.log('🔄 Quiz Queue Redis Client reconnecting...');
});

redisSubscriber.on('reconnecting', () => {
    console.log('🔄 Quiz Queue Redis Subscriber reconnecting...');
});


// Create our job queue
const quizQueue = new Queue('quiz-submission', {
    createClient: function (type) {
        switch (type) {
            case 'client':
                return redisClient;
            case 'subscriber':
                return redisSubscriber;
            default:
                return new Redis(process.env.REDIS_URL, {
                    enableReadyCheck: false,
                    maxRetriesPerRequest: null
                });
        }
    }
});

module.exports = quizQueue;