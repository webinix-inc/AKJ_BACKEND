// const quizQueue = require('./quizQueue');
// const scorecardController = require('../controllers/scorecardController');

// quizQueue.process('autoSubmit', async (job) => {
//     await scorecardController.processAutoSubmit(job);
// });

// module.exports = {
//     initJobProcessor: () => {
//         console.log('Job processor initialized');
//     }
// };

const quizQueue = require('./quizQueue');
const scorecardController = require('../controllers/scorecardController');

// Configure Bull queue processor
quizQueue.process('autoSubmit', 5, async (job) => {
    await scorecardController.processAutoSubmit(job);
});

// Add error handling
quizQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed with error: ${err.message}`);
});

quizQueue.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    await quizQueue.close();
    process.exit(0);
});

module.exports = {
    initJobProcessor: () => {
        console.log('Bull queue job processor initialized');
    }
};