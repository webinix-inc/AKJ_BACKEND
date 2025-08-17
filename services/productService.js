// ============================================================================
// 🏪 PRODUCT BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all product-related business logic that was
// previously mixed in adminController.js. It maintains the same core
// logic and algorithms while providing better separation of concerns.
//
// Functions moved from adminController.js:
// - createProduct business logic (category validation, file handling)
// - updateProduct business logic (validation, file processing)
// - searchProducts business logic (complex aggregation queries)
// - paginateProductSearch business logic (advanced filtering and pagination)
// - Product validation and query utilities
//
// ============================================================================

const Product = require("../models/ProductModel");
const Category = require("../models/course/courseCategory");

// ============================================================================
// 🆕 CREATE PRODUCT BUSINESS LOGIC
// ============================================================================
const createProductLogic = async (productData, files) => {
  try {
    const { productName, description, price, categoryId, color, stock } = productData;

    console.log("🏪 Creating product with business logic service");

    // Process file uploads
    const images = files ? files.map((file) => ({ url: file.path })) : [];

    // Validate category existence
    const categories = await Category.findById(categoryId);
    if (!categories) {
      throw new Error("Category not found");
    }

    // Create product object
    const product = new Product({
      productName,
      description,
      image: images,
      price,
      categoryId,
      color,
      stock,
    });

    // Save product to database
    await product.save();

    console.log("✅ Product created successfully");
    return product;
  } catch (error) {
    console.error("❌ Error in createProductLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔄 UPDATE PRODUCT BUSINESS LOGIC
// ============================================================================
const updateProductLogic = async (productId, updateData, files) => {
  try {
    console.log("🏪 Updating product with business logic service");

    let updatedFields = { ...updateData };

    // Validate subcategory if provided
    if (updatedFields.subCategoryId) {
      const subCategories = await Category.findById(updatedFields.subCategoryId);
      if (!subCategories) {
        throw new Error("SubCategory not found");
      }
    }

    // Validate category if provided
    if (updatedFields.categoryId) {
      const categories = await Category.findById(updatedFields.categoryId);
      if (!categories) {
        throw new Error("Category not found");
      }
    }

    // Process file uploads if provided
    if (files && files.length > 0) {
      const images = files.map((file) => ({ url: file.path }));
      updatedFields.image = images;
    }

    // Update product in database
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updatedFields,
      { new: true }
    );

    if (!updatedProduct) {
      throw new Error("Product not found");
    }

    console.log("✅ Product updated successfully");
    return updatedProduct;
  } catch (error) {
    console.error("❌ Error in updateProductLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔍 SEARCH PRODUCTS BUSINESS LOGIC
// ============================================================================
const searchProductsLogic = async (searchParams) => {
  try {
    const { search } = searchParams;

    console.log("🏪 Searching products with business logic service");

    // Get total products count
    const productsCount = await Product.find().count();

    if (search) {
      // Build aggregation pipeline for search
      const searchPipeline = [
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryId",
          },
        },
        { $unwind: "$categoryId" },
        {
          $match: {
            $or: [
              { "categoryId.name": { $regex: search, $options: "i" } },
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        },
        { $sort: { numOfReviews: -1 } },
      ];

      const searchResults = await Product.aggregate(searchPipeline);
      
      console.log(`✅ Product search completed - Found ${searchResults.length} results`);
      return {
        data: searchResults,
        count: productsCount,
        message: "Product data found.",
      };
    } else {
      // Build aggregation pipeline for all products
      const allProductsPipeline = [
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryId",
          },
        },
        { $unwind: "$categoryId" },
        { $sort: { numOfReviews: -1 } },
      ];

      const allProducts = await Product.aggregate(allProductsPipeline);
      
      console.log(`✅ All products retrieved - Found ${allProducts.length} products`);
      return {
        data: allProducts,
        count: productsCount,
        message: "Product data found.",
      };
    }
  } catch (error) {
    console.error("❌ Error in searchProductsLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📄 PAGINATE PRODUCT SEARCH BUSINESS LOGIC
// ============================================================================
const paginateProductSearchLogic = async (searchParams) => {
  try {
    const { search, fromDate, toDate, categoryId, status, page, limit } = searchParams;

    console.log("🏪 Paginating product search with business logic service");

    // Build query object
    let query = {};

    // Add search criteria
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Add status filter
    if (status) {
      query.status = status;
    }

    // Add category filter
    if (categoryId) {
      query.categoryId = categoryId;
    }

    // Add date range filters
    if (fromDate && !toDate) {
      query.createdAt = { $gte: fromDate };
    }
    if (!fromDate && toDate) {
      query.createdAt = { $lte: toDate };
    }
    if (fromDate && toDate) {
      query.$and = [
        { createdAt: { $gte: fromDate } },
        { createdAt: { $lte: toDate } },
      ];
    }

    // Build pagination options
    let options = {
      page: Number(page) || 1,
      limit: Number(limit) || 15,
      sort: { createdAt: -1 },
      populate: "categoryId",
    };

    // Execute paginated query
    const paginatedResults = await Product.paginate(query, options);

    console.log(`✅ Paginated search completed - Page ${options.page}, Limit ${options.limit}`);
    return {
      data: paginatedResults,
      message: "Product data found.",
    };
  } catch (error) {
    console.error("❌ Error in paginateProductSearchLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📊 PRODUCT VALIDATION UTILITIES
// ============================================================================
const validateProductData = (data) => {
  const errors = [];

  // Required fields validation
  if (!data.productName) errors.push("Product name is required");
  if (!data.description) errors.push("Description is required");
  if (!data.price) errors.push("Price is required");
  if (!data.categoryId) errors.push("Category ID is required");

  // Type validation
  if (data.price && (typeof data.price !== "number" || data.price <= 0)) {
    errors.push("Price must be a positive number");
  }

  if (data.stock && (typeof data.stock !== "number" || data.stock < 0)) {
    errors.push("Stock must be a non-negative number");
  }

  // String validation
  if (data.productName && typeof data.productName !== "string") {
    errors.push("Product name must be a string");
  }

  if (data.description && typeof data.description !== "string") {
    errors.push("Description must be a string");
  }

  return errors;
};

// ============================================================================
// 🔍 PRODUCT QUERY UTILITIES
// ============================================================================
const getProductWithDetails = async (productId) => {
  try {
    const product = await Product.findById(productId)
      .populate("categoryId")
      .populate("reviews");
    
    return product;
  } catch (error) {
    console.error("Error getting product with details:", error);
    throw error;
  }
};

const checkExistingProduct = async (productName, excludeId = null) => {
  try {
    const query = { productName };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const existingProduct = await Product.findOne(query);
    return existingProduct;
  } catch (error) {
    console.error("Error checking existing product:", error);
    throw error;
  }
};

// ============================================================================
// 📈 PRODUCT ANALYTICS UTILITIES
// ============================================================================
const getNewArrivalProductsLogic = async (categoryId, days = 30) => {
  try {
    console.log("🏪 Getting new arrival products");

    // Validate category if provided
    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category) {
        throw new Error("Category not found");
      }
    }

    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Build query
    const query = {
      createdAt: { $gte: dateThreshold },
    };

    if (categoryId) {
      query.categoryId = categoryId;
    }

    // Get new arrival products
    const newArrivalProducts = await Product.find(query)
      .populate("categoryId")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${newArrivalProducts.length} new arrival products`);
    return {
      data: newArrivalProducts,
      message: "New arrival products retrieved successfully",
    };
  } catch (error) {
    console.error("❌ Error in getNewArrivalProductsLogic:", error);
    throw error;
  }
};

const getMostDemandedProductsLogic = async () => {
  try {
    console.log("🏪 Getting most demanded products");

    const mostDemandedProducts = await Product.find({})
      .populate("categoryId")
      .sort({ numOfReviews: -1 });

    console.log(`✅ Found ${mostDemandedProducts.length} most demanded products`);
    return {
      data: mostDemandedProducts,
      message: "Most demanded products retrieved successfully",
    };
  } catch (error) {
    console.error("❌ Error in getMostDemandedProductsLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📊 PRODUCT STATISTICS UTILITIES
// ============================================================================
const getProductStatistics = async () => {
  try {
    const totalProducts = await Product.countDocuments();
    const publishedProducts = await Product.countDocuments({ status: "published" });
    const draftProducts = await Product.countDocuments({ status: "draft" });
    
    const categoryStats = await Product.aggregate([
      {
        $group: {
          _id: "$categoryId",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          categoryName: "$category.name",
          count: 1,
        },
      },
    ]);

    const statistics = {
      totalProducts,
      publishedProducts,
      draftProducts,
      categoryStats,
      averagePrice: await Product.aggregate([
        { $group: { _id: null, avgPrice: { $avg: "$price" } } },
      ]),
    };

    return statistics;
  } catch (error) {
    console.error("❌ Error getting product statistics:", error);
    throw error;
  }
};

// ============================================================================
// 🗑️ DELETE PRODUCT BUSINESS LOGIC
// ============================================================================
const deleteProductLogic = async (productId) => {
  try {
    console.log("🏪 Deleting product with business logic service");

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error("Product not found");
    }

    await Product.findByIdAndDelete(productId);

    console.log("✅ Product deleted successfully");
    return {
      message: "Product deleted successfully",
      productId: productId,
    };
  } catch (error) {
    console.error("❌ Error in deleteProductLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  createProductLogic,
  updateProductLogic,
  searchProductsLogic,
  paginateProductSearchLogic,
  validateProductData,
  getProductWithDetails,
  checkExistingProduct,
  getNewArrivalProductsLogic,
  getMostDemandedProductsLogic,
  getProductStatistics,
  deleteProductLogic,
};
