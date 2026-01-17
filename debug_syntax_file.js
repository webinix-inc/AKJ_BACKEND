
const fs = require('fs');
try {
    require('./controllers/installmentController');
    fs.writeFileSync('syntax_error_log.txt', '✅ Syntax is valid');
} catch (e) {
    const errorLog = `❌ Syntax Error Details:\nMessage: ${e.message}\nStack: ${e.stack}`;
    fs.writeFileSync('syntax_error_log.txt', errorLog);
}
