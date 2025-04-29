const redis = require('redis');
require('dotenv').config();

const createRedisClient = () => {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 10000,
      readTimeout: 10000,
      keepAlive: 10000
    }
  });

  client.on('error', (err) => console.error('Redis client error:', err));
  client.on('connect', () => console.log('Redis client connected'));

  return client;
};

const redisClient = createRedisClient();
const redisSubscriber = createRedisClient();

(async () => {
  try {
    await redisClient.connect();
    await redisSubscriber.connect();
    console.log('All Redis clients connected successfully');
  } catch (err) {
    console.error('Error connecting to Redis:', err);
  }
})();

const disconnectRedis = async () => {
    try {
      await redisClient.disconnect();
      await redisSubscriber.disconnect();
      console.log('All Redis clients disconnected successfully');
    } catch (err) {
      console.error('Error disconnecting from Redis:', err);
    }
  };

module.exports = { redisClient, redisSubscriber, disconnectRedis };