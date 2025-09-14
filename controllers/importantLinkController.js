const mongoose = require("mongoose");

const ImportantLink = require("../models/importantLinksModel");

exports.createImportantLink = async (req, res) => {
    try{
        const {name, url} = req.body;

        const existingLink = await ImportantLink.findOne({ name });
        if (existingLink) {
            return res.status(400).json({ message: 'Link with this name already exists. Please create a link with another name.' });
        }

        const newLink = await ImportantLink.create({
            name,
            url
        });

        return res.status(201).json({message: 'Link created successfully', link: newLink});
    } catch (error) {
        console.error('Error creating link:', error);
        return res.status(500).json({message: 'Failed to create link', error: error.message});
    }
}

exports.getImportantLinks = async (req, res) => {
    try {
        console.log('🔍 Fetching important links from database...');
        
        // 🔧 FIX: Add timeout and better error handling
        const links = await ImportantLink.find().maxTimeMS(5000);
        
        console.log(`✅ Found ${links.length} important links`);
        
        return res.status(200).json({
            status: 200,
            message: "Links fetched successfully", 
            links: links
        });
    } catch (error) {
        console.error('❌ Error fetching links:', error);
        return res.status(500).json({
            status: 500,
            message: 'Failed to fetch links', 
            error: error.message
        });
    }
}

exports.updateImportantLink = async (req, res) => {
    try {
        const {linkId} = req.params;
        const {name, url} = req.body;

        const updatedLink = await ImportantLink.findByIdAndUpdate(
            linkId, {
                name, url
            }, {new: true, runValidators: true});

        if (!updatedLink) {
            return res.status(404).json({message: 'Link not found'});
        }

        return res.status(200).json({message: 'Link updated successfully', link: updatedLink});
    } catch (error) {
        console.error('Error updating link:', error);
        return res.status(500).json({message: 'Failed to update link', error: error.message});
    }
}

exports.deleteImportantLink = async (req, res) => {
    try {
        const {linkId} = req.params;

        const deletedLink = await ImportantLink.findByIdAndDelete(linkId);

        if (!deletedLink) {
            return res.status(404).json({message: 'Link not found'});
        }

        return res.status(200).json({message: 'Link deleted successfully', link: deletedLink});
    } catch (error) {
        console.error('Error deleting link:', error);
        return res.status(500).json({message: 'Failed to delete link', error: error.message});
    }
}