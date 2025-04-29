const Location = require('../models/Location');
const mongoose = require("mongoose");

// Save Location
exports.saveLocation = async (req, res) => {
    try {
        const { name, firstName, lastName, email, phone, address, country, region, city, postCode } = req.body;
        const userId = req.user._id; // Get user ID from auth middleware

        const newLocation = new Location({
            userId,
            name,
            firstName,
            lastName,
            email,
            phone,
            address,
            country,
            region,
            city,
            postCode,
        });

        await newLocation.save();
        res.status(201).json({ success: true, message: "Location saved successfully!", location: newLocation });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error saving location", error });
    }
};

/// Get Saved Locations
exports.getSavedLocations = async (req, res) => {
    try {
        const userId = req.user._id;
        console.log("Print the user id:", userId);
        const locations = await Location.find({ userId });
        res.status(200).json({ success: true, locations });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching locations", error });
    }
};