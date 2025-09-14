const mongoose = require('mongoose');
require('dotenv').config();

// Import the folder model
const Folder = require('./models/folderModel');

async function checkTestFolders() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.DB_URL);
        console.log('✅ Connected to MongoDB');

        // Check all folders
        const allFolders = await Folder.find({});
        console.log(`\n📁 Total folders in database: ${allFolders.length}`);

        if (allFolders.length === 0) {
            console.log('❌ No folders found in database!');
            console.log('🔧 Creating a sample test folder...');
            
            // Create a sample folder
            const sampleFolder = new Folder({
                name: 'Sample Test Folder',
                folderType: 'general',
                courses: [],
                isVisible: true,
                createdBy: new mongoose.Types.ObjectId('688a5d65da8d8a6c6456ef7c'), // Sample admin ID
                description: 'Sample folder for testing'
            });
            
            await sampleFolder.save();
            console.log('✅ Sample folder created:', sampleFolder.name);
        } else {
            console.log('\n📋 Existing folders:');
            allFolders.forEach((folder, index) => {
                console.log(`${index + 1}. ${folder.name} (ID: ${folder._id})`);
                console.log(`   - Type: ${folder.folderType}`);
                console.log(`   - Visible: ${folder.isVisible}`);
                console.log(`   - Courses: ${folder.courses?.length || 0}`);
                console.log(`   - Created: ${folder.createdAt}`);
                console.log('');
            });
        }

        // Check visible folders specifically
        const visibleFolders = await Folder.find({ isVisible: true });
        console.log(`\n👁️ Visible folders: ${visibleFolders.length}`);
        
        if (visibleFolders.length === 0) {
            console.log('⚠️ No visible folders found! Making all folders visible...');
            await Folder.updateMany({}, { isVisible: true });
            console.log('✅ All folders are now visible');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📤 Disconnected from MongoDB');
    }
}

checkTestFolders();
