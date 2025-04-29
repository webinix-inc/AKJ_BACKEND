const Redis = require('ioredis');
const redisClient = new Redis(process.env.REDIS_URL, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null
});

module.exports = redisClient;