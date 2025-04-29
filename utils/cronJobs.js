const cron = require('node-cron');
const Scorecard = require('../models/scorecardModel');
const { finishQuizHelper, calculateScores} = require('./scoreUtils');
const redisClient = require('../configs/redisTest');


let cronJob = null;

const getAnswersCacheKey = (scorecardId) => `quiz:answers:${scorecardId}`;
const getPendingWritesKey = () => 'quiz:pending_writes';

const processPendingWrites = async () => {
    try {
        await redisClient.ping();
    } catch (error) {
        console.error('Redis connection error:', error);
        return; // Exit if Redis is not available
    }
    const pendingWritesKey = getPendingWritesKey();
    console.log('Fetching pending writes from key:', pendingWritesKey);
    const pendingScorecards = await redisClient.smembers(pendingWritesKey);
    console.log('Pending scorecards:', pendingScorecards);

    for (const scorecardId of pendingScorecards) {
        try {
            console.log(`Processing scorecard: ${scorecardId}`);
            const cacheKey = getAnswersCacheKey(scorecardId);
            console.log('Fetching cached answers from key:', cacheKey);

            const cachedAnswers = await redisClient.get(cacheKey);
            console.log('Cached answers:', cachedAnswers);

            if (!cachedAnswers) {
                console.log(`No cached answers found for scorecard ${scorecardId}`);
                continue;
            }

            const answers = JSON.parse(cachedAnswers);
            console.log('Parsed answers:', answers);

            const scorecard = await Scorecard.findById(scorecardId);

            if (!scorecard) {
                console.log(`Scorecard ${scorecardId} not found in database`);
                await redisClient.del(cacheKey);
                await redisClient.srem(pendingWritesKey, scorecardId);
                continue;
            }

            if (scorecard.completed) {
                console.log(`Scorecard ${scorecardId} is already completed`);
                await redisClient.del(cacheKey);
                await redisClient.srem(pendingWritesKey, scorecardId);
                continue;
            }

            scorecard.answers = [...scorecard.answers, ...answers];

            scorecard.answers = scorecard.answers.reduce((acc, answer) => {
                const existingIndex = acc.findIndex(a => a.questionId === answer.questionId);
                if (existingIndex !== -1) {
                    acc[existingIndex] = answer;
                } else {
                    acc.push(answer);
                }
                return acc;
            }, []);

            // scorecard.answers = answers;
            const scores = calculateScores(answers);
            Object.assign(scorecard, scores);

            console.log(`Saving scorecard ${scorecardId} with answers:`, answers);
            await scorecard.save();
            console.log(`Batch processed answers for scorecard ${scorecardId}`);

            console.log(`Cleaning up Redis keys for scorecard ${scorecardId}`);
            await redisClient.del(cacheKey);
            await redisClient.srem(pendingWritesKey, scorecardId);

        } catch (error) {
            console.error(`Error processing cached answers for ${scorecardId}:`, error);
        }
    }
};

const startCronJob = () => {
    if (cronJob) {
        console.log('Cron job is already running');
        return;
    }

    cronJob = cron.schedule('*/3 * * * *', async () => {
        console.log('Running backup auto-submission check...');

        try {
            await processPendingWrites();
        } catch (error) {
            console.error('Error in periodic batch processing:', error);
        }
        
        const currentTime = new Date();
        const expiredScorecards = await Scorecard.find({
            completed: false,
            expectedEndTime: { $lte: currentTime }
        });

        for (const scorecard of expiredScorecards) {
            try {
                await finishQuizHelper(scorecard);
                console.log(`Backup auto-submitted scorecard ${scorecard._id}`);
            } catch (error) {
                console.error(`Error in backup auto-submission for ${scorecard._id}:`, error);
            }
        }
    });

    console.log('Cron job started');
};

const stopCronJob = () => {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('Cron job stopped');
    } else {
        console.log('No cron job is running');
    }
};

module.exports = { startCronJob, stopCronJob, processPendingWrites,getAnswersCacheKey, getPendingWritesKey };