const fs = require('fs');
const path = require('path');

// Create LogFile directory if it doesn't exist
const LOG_DIR = path.join(__dirname, '../LogFile');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    console.log('Created LogFile directory:', LOG_DIR);
}

// Log file paths
const LOG_FILES = {
    USER_ACTIVITY: path.join(LOG_DIR, 'user_activity.txt'),
    ADMIN_ACTIVITY: path.join(LOG_DIR, 'admin_activity.txt'),
    ERROR_LOG: path.join(LOG_DIR, 'error_log.txt'),
    SYSTEM_LOG: path.join(LOG_DIR, 'system_log.txt'),
    API_ACCESS: path.join(LOG_DIR, 'api_access.txt')
};

// Utility function to format timestamp
const getTimestamp = () => {
    return new Date().toISOString();
};

// Utility function to write to log file
const writeToLog = (filePath, message) => {
    const timestamp = getTimestamp();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    fs.appendFile(filePath, logEntry, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
};

// Logger functions
const logger = {
    // User activity logging
    userActivity: (userId, userName, action, details = '') => {
        const message = `USER_ID: ${userId} | USER: ${userName} | ACTION: ${action} | DETAILS: ${details}`;
        writeToLog(LOG_FILES.USER_ACTIVITY, message);
        console.log(`[USER] ${message}`);
    },

    // Admin activity logging
    adminActivity: (adminId, adminName, action, details = '') => {
        const message = `ADMIN_ID: ${adminId} | ADMIN: ${adminName} | ACTION: ${action} | DETAILS: ${details}`;
        writeToLog(LOG_FILES.ADMIN_ACTIVITY, message);
        console.log(`[ADMIN] ${message}`);
    },

    // Error logging
    error: (error, context = '', userId = null) => {
        const message = `ERROR: ${error.message || error} | CONTEXT: ${context} | USER_ID: ${userId} | STACK: ${error.stack || 'N/A'}`;
        writeToLog(LOG_FILES.ERROR_LOG, message);
        console.error(`[ERROR] ${message}`);
    },

    // System logging
    system: (action, details = '') => {
        const message = `SYSTEM_ACTION: ${action} | DETAILS: ${details}`;
        writeToLog(LOG_FILES.SYSTEM_LOG, message);
        console.log(`[SYSTEM] ${message}`);
    },

    // API access logging
    apiAccess: (method, endpoint, userId = null, userType = 'user', responseStatus = null, responseTime = null) => {
        const message = `METHOD: ${method} | ENDPOINT: ${endpoint} | USER_ID: ${userId} | USER_TYPE: ${userType} | STATUS: ${responseStatus} | TIME: ${responseTime}ms`;
        writeToLog(LOG_FILES.API_ACCESS, message);
        console.log(`[API] ${message}`);
    },

    // General info logging
    info: (message, category = 'INFO') => {
        const logMessage = `[${category}] ${message}`;
        writeToLog(LOG_FILES.SYSTEM_LOG, logMessage);
        console.log(logMessage);
    }
};

// Middleware for API access logging
const apiLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(body) {
        const responseTime = Date.now() - startTime;
        const userId = req.userId || req.user?.id || null;
        const userType = req.userType || (req.originalUrl.includes('/admin/') ? 'admin' : 'user');
        
        logger.apiAccess(
            req.method,
            req.originalUrl,
            userId,
            userType,
            res.statusCode,
            responseTime
        );
        
        return originalSend.call(this, body);
    };
    
    next();
};

module.exports = {
    logger,
    apiLogger,
    LOG_FILES,
    LOG_DIR
};
