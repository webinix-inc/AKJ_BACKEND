const Book = require("../models/Book");
const {
  generatePresignedUrl,
  generateUploadUrl,
  deleteFilesFromBucket,
} = require("../configs/aws.config");

// Helper to parse numerical fields
const parseField = (field) => (field ? Number(field) : undefined);

// Get all books
exports.getBooks = async (req, res) => {
  try {
    const books = await Book.find();

    // Generate pre-signed URLs for book images (same as courses/banners)
    const { generatePresignedUrl } = require("../configs/aws.config");
    const processedBooks = await Promise.all(
      books.map(async (book) => {
        const bookObj = book.toObject();

        // Process book image to use pre-signed URL
        if (bookObj.imageUrl && bookObj.imageUrl.includes("amazonaws.com/")) {
          try {
            const s3Key = bookObj.imageUrl.split("amazonaws.com/")[1];
            const bucketName = process.env.S3_BUCKET || "wakadclass";

            console.log(
              `🔗 [PRESIGN] Generating pre-signed URL for book ${book._id} image`
            );

            // Generate pre-signed URL with longer expiration (24 hours)
            const presignedUrl = await generatePresignedUrl(
              bucketName,
              s3Key,
              86400
            );
            bookObj.imageUrl = presignedUrl;

            console.log(
              `✅ [PRESIGN] Generated pre-signed URL for book ${book._id}`
            );
          } catch (error) {
            console.error(
              `❌ [PRESIGN] Failed to generate pre-signed URL for book ${book._id}:`,
              error
            );
            // Keep original URL as fallback
          }
        }

        return bookObj;
      })
    );

    console.log(`📚 Fetched ${books.length} books with pre-signed URLs`);
    res.json(processedBooks);
  } catch (error) {
    console.error("❌ Error fetching books:", error);
    res.status(500).json({ message: "Error fetching books", error });
  }
};

// Get book by ID
exports.getBookById = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Generate pre-signed URL for book image (same as other endpoints)
    const { generatePresignedUrl } = require("../configs/aws.config");
    const bookObj = book.toObject();

    // Process book image to use pre-signed URL
    if (bookObj.imageUrl && bookObj.imageUrl.includes("amazonaws.com/")) {
      try {
        const s3Key = bookObj.imageUrl.split("amazonaws.com/")[1];
        const bucketName = process.env.S3_BUCKET || "wakadclass";

        console.log(
          `🔗 [PRESIGN] Generating pre-signed URL for single book ${book._id} image`
        );

        // Generate pre-signed URL with longer expiration (24 hours)
        const presignedUrl = await generatePresignedUrl(
          bucketName,
          s3Key,
          86400
        );
        bookObj.imageUrl = presignedUrl;

        console.log(
          `✅ [PRESIGN] Generated pre-signed URL for single book ${book._id}`
        );
      } catch (error) {
        console.error(
          `❌ [PRESIGN] Failed to generate pre-signed URL for single book ${book._id}:`,
          error
        );
        // Keep original URL as fallback
      }
    }

    res.json(bookObj);
  } catch (error) {
    console.error("❌ Error fetching book:", error);
    res.status(500).json({ message: "Error fetching book", error });
  }
};

// exports.createBook = async (req, res) => {
//   try {
//     const {
//       name,
//       author,
//       price,
//       stock,
//       description,
//       courseNames,
//       dimensions,
//       showUnder,
//       height,
//       length,
//       weight,
//     } = req.body;

//     // Convert string fields to their correct types
//     const parsedPrice = parseField(price);
//     const parsedStock = parseField(stock);
//     const parsedHeight = parseField(height);
//     const parsedLength = parseField(length);
//     const parsedWeight = parseField(weight);
//     const parsedCourseNames = courseNames ? JSON.parse(courseNames) : [];

//     // Validate required fields
//     if (!name || !price || !stock || !description || !courseNames) {
//       return res
//         .status(400)
//         .json({ message: "All fields except author are required" });
//     }

//     // Map uploaded files to URLs, whether single or multiple
//     const imageUrls = req.files.map((file) => file.location);

//     const newBook = new Book({
//       name,
//       author,
//       price,
//       stock,
//       description,
//       courseNames: parsedCourseNames,
//       dimensions,
//       showUnder,
//       imageUrl: imageUrls[0] || null, // Use the first image as the main image
//       additionalImages: imageUrls.slice(1), // Additional images (if any)
//     });

//     await newBook.save();

//     return res.status(201).json({
//       message: "Book created successfully",
//       book: newBook,
//       imageUrls,
//     });
//   } catch (error) {
//     console.error("Error creating book:", error);
//     return res.status(500).json({ message: "Error creating book", error });
//   }
// };

exports.createBook = async (req, res) => {
  try {
    const {
      name,
      author,
      price,
      stock,
      description,
      courseNames,
      showUnder,
      height,
      length,
      weight,
    } = req.body;

    // Parse types
    const parsedPrice = parseField(price);
    const parsedStock = parseField(stock);
    const parsedHeight = parseField(height);
    const parsedLength = parseField(length);
    const parsedWeight = parseField(weight);
    const parsedCourseNames = courseNames ? JSON.parse(courseNames) : [];

    // Validate required fields
    if (
      !name ||
      !price ||
      !stock ||
      !description ||
      !parsedCourseNames.length
    ) {
      return res.status(400).json({
        message: "All fields except author are required",
      });
    }

    // Validate image files
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one image is required." });
    }

    const imageUrls = req.files.map((file) => file.location);
    const primaryImage = imageUrls[0];
    const additionalImages = imageUrls.slice(1);

    const newBook = new Book({
      name,
      author,
      price: parsedPrice,
      stock: parsedStock,
      description,
      courseNames: parsedCourseNames,
      showUnder,
      imageUrl: primaryImage,
      additionalImages,
      dimensions: {
        height: parsedHeight,
        length: parsedLength,
        weight: parsedWeight,
        breadth: req.body.breadth ? parseField(req.body.breadth) : 0,
      },
    });

    await newBook.save();

    return res.status(201).json({
      message: "Book created successfully",
      book: newBook,
      imageUrls,
    });
  } catch (error) {
    console.error("Error creating book:", error);
    return res.status(500).json({ message: "Error creating book", error });
  }
};

// Update a book, potentially with a new image
// exports.updateBook = async (req, res) => {
//   try {
//     const {
//       name,
//       author,
//       price,
//       stock,
//       description,
//       courseNames,
//       dimensions,
//       showUnder,
//       newImage,
//       height,
//       length,
//       weight,
//     } = req.body;

//     // Validate required fields
//     if (!name || isNaN(price) || isNaN(stock) || !description || !courseNames) {
//       return res
//         .status(400)
//         .json({ message: "All fields except author are required" });
//     }

//     // Convert strings to their appropriate types
//     const parsedPrice = parseField(price);
//     const parsedStock = parseField(stock);
//     const parsedHeight = parseField(height);
//     const parsedLength = parseField(length);
//     const parsedWeight = parseField(weight);
//     const parsedCourseNames = courseNames ? JSON.parse(courseNames) : [];

//     const updatedData = {
//       name,
//       author,
//       price: parsedPrice,
//       stock: parsedStock,
//       description,
//       courseNames: parsedCourseNames,
//       dimensions,
//       showUnder,
//       height: parsedHeight,
//       length: parsedLength,
//       weight: parsedWeight,
//     };

//     // If a new image is provided, generate a new upload URL and update the image URL
//     let uploadUrl;
//     if (newImage) {
//       const imageKey = `books/${Date.now()}_${name.replace(/\s+/g, "_")}.jpg`;
//       uploadUrl = await generateUploadUrl(process.env.S3_BUCKET, imageKey);
//       updatedData.imageUrl = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${imageKey}`;
//     }

//     const book = await Book.findByIdAndUpdate(req.params.id, updatedData, {
//       new: true,
//     });
//     if (!book) {
//       return res.status(404).json({ message: "Book not found" });
//     }

//     res.json({
//       message: "Book updated successfully",
//       book,
//       uploadUrl: newImage ? uploadUrl : undefined,
//       imageUrl: newImage ? updatedData.imageUrl : book.imageUrl,
//     });
//   } catch (error) {
//     console.error("Error updating book:", error);
//     res.status(500).json({ message: "Error updating book", error });
//   }
// };

exports.updateBook = async (req, res) => {
  try {
    const {
      name,
      author,
      price,
      stock,
      description,
      courseNames,
      showUnder,
      length,
      breadth,
      height,
      weight,
    } = req.body;

    if (!name || isNaN(price) || isNaN(stock) || !description || !courseNames) {
      return res
        .status(400)
        .json({ message: "All fields except author are required" });
    }

    const parsedCourseNames = JSON.parse(courseNames);

    const dimensions = {
      length: parseFloat(length) || 0,
      breadth: parseFloat(breadth) || 0,
      height: parseFloat(height) || 0,
      weight: parseFloat(weight) || 0,
    };

    const updatedData = {
      name,
      author,
      price: parseFloat(price),
      stock: parseInt(stock),
      description,
      courseNames: parsedCourseNames,
      showUnder,
      dimensions,
    };

    // Handle new images or deletion flags
    if (req.files && req.files.length > 0) {
      const imageUrls = req.files.map((file) => file.location); // S3 support
      updatedData.imageUrl = imageUrls[0]; // primary image
      updatedData.additionalImages = imageUrls.slice(1); // additional
    } else {
      // No new images found. Check for deletion flags or preserve existing.
      const existingBook = await Book.findById(req.params.id);
      if (!existingBook) {
        return res.status(404).json({ message: "Book not found" });
      }

      // Handle Primary Image Deletion
      if (req.body.deletePrimaryImage === "true") {
        updatedData.imageUrl = null;
        // Ideally delete from S3 here using existingBook.imageUrl
      } else {
        updatedData.imageUrl = existingBook.imageUrl;
      }

      // Handle Additional Images Deletion
      if (req.body.deleteAdditionalImages === "true") {
        updatedData.additionalImages = [];
        // Ideally delete from S3 here using existingBook.additionalImages
      } else {
        updatedData.additionalImages = existingBook.additionalImages;
      }
    }

    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id,
      updatedData,
      {
        new: true,
      }
    );

    res.json({
      message: "Book updated successfully",
      book: updatedBook,
    });
  } catch (error) {
    console.error("Error updating book:", error);
    res.status(500).json({ message: "Error updating book", error });
  }
};

// Delete a book and associated image from S3
exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Extract the S3 image key from the book's imageUrl and delete the image
    const imageKey = extractKeyFromUrl(book.imageUrl);
    await deleteFilesFromBucket(process.env.S3_BUCKET, [imageKey]);

    res.json({ message: "Book deleted successfully" });
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).json({ message: "Error deleting book", error });
  }
};

const extractKeyFromUrl = (url) => {
  const urlParts = url.split("/");
  return urlParts.slice(3).join("/");
};
