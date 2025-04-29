require('dotenv').config();

const Queue = require('bull');
const Redis = require('ioredis');
// const Redis = require('redis');

// Create a new Redis client
const redisClient = new Redis(process.env.REDIS_URL, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null
});
const redisSubscriber = new Redis(process.env.REDIS_URL, {
    enableReadyCheck: false,
    maxRetriesPerRequest: null
});

redisClient.on('connect', () => {
    console.log('Connected to Redis Client');
});
redisSubscriber.on('connect', () => {
    console.log('Connected to Redis Subscriber');
});

redisClient.on('error', (error) => {
    console.error('Error in Redis Client', error);
});
redisSubscriber.on('error', (error) => {
    console.error('Error in Redis Subscriber', error);
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