import { CategoryService } from "../services/categoryService.js";

/**
 * Category Controller
 * Handles HTTP requests for category operations
 */

export const createCategory = async (req, res) => {
  try {
    const businessId = req.business?._id || req.body.businessId;
    const createdBy = req.user?._id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required.",
      });
    }

    const category = await CategoryService.createCategory(
      req.body,
      businessId,
      createdBy
    );

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      data: category.getFullDetails(),
    });

  } catch (error) {
    console.error("Create category error → ", error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors
      });
    }

    // Handle duplicate errors
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating category.",
      error: error.message
    });
  }
};

export const listCategories = async (req, res) => {
  try {
    const businessId = req.business?._id || req.query.businessId;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required.",
      });
    }

    const { 
      type, 
      vatApplicable, 
      includeInactive = false,
      page = 1,
      limit = 50
    } = req.query;

    const filters = {
      type,
      vatApplicable: vatApplicable !== undefined ? vatApplicable === 'true' : undefined,
      includeInactive: includeInactive === 'true',
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await CategoryService.getCategories(businessId, filters);

    // Transform categories to include summary
    const categoriesData = result.categories.map(category => category.getSummary());

    return res.status(200).json({
      success: true,
      message: "Categories retrieved successfully.",
      data: {
        categories: categoriesData,
        pagination: result.pagination,
        filters: {
          type: type || 'all',
          vatApplicable: vatApplicable || 'all',
          includeInactive: includeInactive === 'true'
        }
      },
    });

  } catch (error) {
    console.error("List categories error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving categories.",
      error: error.message
    });
  }
};

export const getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const category = await CategoryService.getCategoryById(id, businessId);

    return res.status(200).json({
      success: true,
      message: "Category retrieved successfully.",
      data: category.getFullDetails(),
    });

  } catch (error) {
    console.error("Get category error → ", error);

    if (error.message.includes('Invalid category ID') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving category.",
      error: error.message
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;
    const updates = req.body;

    const category = await CategoryService.updateCategory(
      id,
      businessId,
      updates
    );

    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      data: category.getFullDetails(),
    });

  } catch (error) {
    console.error("Update category error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating category.",
      error: error.message
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const category = await CategoryService.deleteCategory(id, businessId);

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully.",
      data: {
        id: category._id,
        name: category.name,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    console.error("Delete category error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes('being used')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deleting category.",
      error: error.message
    });
  }
};

export const assignCategoryToTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { categoryId } = req.body;
    const businessId = req.business?._id;
    const assignedBy = req.user?._id;

    const transaction = await CategoryService.assignCategoryToTransaction(
      transactionId,
      categoryId,
      businessId,
      assignedBy
    );

    return res.status(200).json({
      success: true,
      message: "Category assigned to transaction successfully.",
      data: {
        transaction: {
          id: transaction._id,
          mpesaTransactionId: transaction.mpesaTransactionId,
          amount: transaction.amount,
          transactionTime: transaction.transactionTime,
          category: transaction.categoryId
        },
        assignment: {
          assignedAt: transaction.categoryAssignedAt,
          assignedBy: assignedBy
        }
      },
    });

  } catch (error) {
    console.error("Assign category to transaction error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while assigning category to transaction.",
      error: error.message
    });
  }
};

export const bulkAssignCategories = async (req, res) => {
  try {
    const { transactionIds, categoryId } = req.body;
    const businessId = req.business?._id;
    const assignedBy = req.user?._id;

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Transaction IDs array is required.",
      });
    }

    const result = await CategoryService.bulkAssignCategory(
      transactionIds,
      categoryId,
      businessId,
      assignedBy
    );

    return res.status(200).json({
      success: true,
      message: "Categories assigned to transactions successfully.",
      data: result,
    });

  } catch (error) {
    console.error("Bulk assign categories error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while bulk assigning categories.",
      error: error.message
    });
  }
};

export const getCategoryStatistics = async (req, res) => {
  try {
    const businessId = req.business?._id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required.",
      });
    }

    const statistics = await CategoryService.getCategoryStatistics(businessId);

    return res.status(200).json({
      success: true,
      message: "Category statistics retrieved successfully.",
      data: statistics,
    });

  } catch (error) {
    console.error("Get category statistics error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving category statistics.",
      error: error.message
    });
  }
};

export const deactivateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const category = await CategoryService.updateCategory(
      id,
      businessId,
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: "Category deactivated successfully.",
      data: category.getSummary(),
    });

  } catch (error) {
    console.error("Deactivate category error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deactivating category.",
      error: error.message
    });
  }
};

export const activateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const category = await CategoryService.updateCategory(
      id,
      businessId,
      { isActive: true }
    );

    return res.status(200).json({
      success: true,
      message: "Category activated successfully.",
      data: category.getSummary(),
    });

  } catch (error) {
    console.error("Activate category error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while activating category.",
      error: error.message
    });
  }
};