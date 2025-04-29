const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    author: {
        type: String,
    },
    price: {
        type: Number,
        required: true,
    },
    stock: {
        type: Number,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    dimensions: {
        length: { type: Number, default: 0 },
        breadth: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
        weight: { type: Number, default: 0 },
    },
    imageUrl: {
        type: String,
        required: true,
    },
    additionalImages: [{
        type: String, 
    }],
    courseNames: [{
        type: String,
        required: true,
    }],
    showUnder: {
        type: String,
    }
});

const Book = mongoose.model('Book', bookSchema);

module.exports = Book;
