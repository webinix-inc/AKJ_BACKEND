const redisClient = require('../configs/redisTest');
const calculateScores = (answers) => {
    if (!Array.isArray(answers) || answers.length === 0) {
        return { score: 0, correctQuestions: 0, incorrectQuestions: 0 };
    }

    return answers.reduce((acc, answer) => {
        if (!answer || typeof answer.marks !== 'number' || typeof answer.isCorrect !== 'boolean') {
            console.warn('Invalid answer object:', answer);
            return acc;
        }

        return {
            score: acc.score + answer.marks,
            correctQuestions: acc.correctQuestions + (answer.isCorrect ? 1 : 0),
            incorrectQuestions: acc.incorrectQuestions + (answer.isCorrect ? 0 : 1)
        };
    }, { score: 0, correctQuestions: 0, incorrectQuestions: 0 });
};

const finishQuizHelper = async (scorecard) => {
    if (!scorecard || !Array.isArray(scorecard.answers)) {
        console.error('Invalid scorecard or answers array');
        return scorecard;
    }

    const cacheKey = `quiz:answers:${scorecard._id}`;

    try {
        const cachedAnswers = await redisClient.get(cacheKey);
        if (cachedAnswers) {
            const parsedAnswers = JSON.parse(cachedAnswers);
            if (Array.isArray(parsedAnswers) && parsedAnswers.length > 0) {
                scorecard.answers = parsedAnswers;
            }
        }
    } catch (error) {
        console.error('Error fetching cached answers:', error);
    }

    const calculatedScores = calculateScores(scorecard.answers);

    // 
    
    scorecard.score = calculatedScores.score;
    scorecard.correctQuestions = calculatedScores.correctQuestions;
    scorecard.incorrectQuestions = calculatedScores.incorrectQuestions;

    console.log('Final scorecard calculations:', {
        answers: scorecard.answers.length,
        score: scorecard.score,
        correct: scorecard.correctQuestions,
        incorrect: scorecard.incorrectQuestions
    });


    try {
        await scorecard.save();
        console.log(`Quiz ${scorecard.autoSubmitted ? 'auto-submitted' : 'completed'} for scorecard ${scorecard._id}`);
    } catch (error) {
        console.error('Error saving scorecard:', error);
        throw error;
    }
    
    return scorecard;
};

module.exports = { calculateScores, finishQuizHelper };