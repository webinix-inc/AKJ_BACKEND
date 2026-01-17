
try {
    require('./controllers/installmentController');
    console.log("✅ Syntax is valid");
} catch (e) {
    console.error("❌ Syntax Error Message:");
    console.error(e.message);
    const stackLines = e.stack.split('\n');
    console.error("❌ Stack Top:");
    console.error(stackLines.slice(0, 5).join('\n'));
}
