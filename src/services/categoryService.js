import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";

/**
 * Category Service
 * Handles business logic for category operations
 */

export class CategoryService {
  /**
   * Create a new category
   */
  static async createCategory(categoryData, businessId, createdBy) {
    const {
      name,
      description,
      type,
      vatApplicable,
      vatRate,
      kraTaxCode,
      categoryGroup,
      displayOrder
    } = categoryData;

    // Check for duplicate category name
    const existingCategory = await Category.findOne({
      name,
      businessId,
      isActive: true
    });

    if (existingCategory) {
      throw new Error('A category with this name already exists for your business.');
    }

    // Check for duplicate KRA tax code
    const existingTaxCode = await Category.findOne({
      kraTaxCode,
      businessId,
      isActive: true
    });

    if (existingTaxCode) {
      throw new Error('A category with this KRA tax code already exists for your business.');
    }

    const category = new Category({
      name: name.trim(),
      description: description?.trim(),
      type,
      vatApplicable: vatApplicable || false,
      kraTaxCode,
      businessId,
      createdBy,
      categoryGroup: categoryGroup?.trim(),
      displayOrder: displayOrder || 0,
      ...(vatApplicable && { vatRate })
    });

    await category.save();
    await category.populate('businessId', 'businessName mpesaShortCode');
    await category.populate('createdBy', 'fullName email');

    return category;
  }

  /**
   * Get categories with filtering and pagination
   */
  static async getCategories(businessId, filters = {}) {
    const {
      type,
      vatApplicable,
      includeInactive = false,
      page = 1,
      limit = 50
    } = filters;

    const query = { businessId };
    
    if (type && ['income', 'expense'].includes(type)) {
      query.type = type;
    }

    if (vatApplicable !== undefined) {
      query.vatApplicable = vatApplicable;
    }

    if (!includeInactive) {
      query.isActive = true;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [categories, total] = await Promise.all([
      Category.find(query)
        .populate('businessId', 'businessName mpesaShortCode')
        .populate('createdBy', 'fullName email')
        .sort({ displayOrder: 1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .exec(),
      Category.countDocuments(query)
    ]);

    return {
      categories,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalCategories: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    };
  }

  /**
   * Get single category by ID
   */
  static async getCategoryById(categoryId, businessId) {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      throw new Error('Invalid category ID format.');
    }

    const category = await Category.findOne({
      _id: categoryId,
      businessId,
      isActive: true
    })
    .populate('businessId', 'businessName mpesaShortCode')
    .populate('createdBy', 'fullName email');

    if (!category) {
      throw new Error('Category not found or you don\'t have permission to access it.');
    }

    return category;
  }

  /**
   * Update category
   */
  static async updateCategory(categoryId, businessId, updates) {
    const category = await Category.findOne({
      _id: categoryId,
      businessId,
      isActive: true
    });

    if (!category) {
      throw new Error('Category not found or you don\'t have permission to update it.');
    }

    // Check for duplicate name
    if (updates.name && updates.name !== category.name) {
      const existingCategory = await Category.findOne({
        name: updates.name,
        businessId,
        isActive: true,
        _id: { $ne: categoryId }
      });

      if (existingCategory) {
        throw new Error('A category with this name already exists for your business.');
      }
    }

    // Check for duplicate KRA tax code
    if (updates.kraTaxCode && updates.kraTaxCode !== category.kraTaxCode) {
      const existingTaxCode = await Category.findOne({
        kraTaxCode: updates.kraTaxCode,
        businessId,
        isActive: true,
        _id: { $ne: categoryId }
      });

      if (existingTaxCode) {
        throw new Error('A category with this KRA tax code already exists for your business.');
      }
    }

    await category.updateCategory(updates);
    await category.populate('businessId', 'businessName mpesaShortCode');
    await category.populate('createdBy', 'fullName email');

    return category;
  }

  /**
   * Delete category (soft delete)
   */
  static async deleteCategory(categoryId, businessId) {
    const category = await Category.findOne({
      _id: categoryId,
      businessId,
      isActive: true
    });

    if (!category) {
      throw new Error('Category not found or already deleted.');
    }

    // Check if category is being used by any transactions
    const transactionCount = await Transaction.countDocuments({
      categoryId,
      status: { $ne: 'deleted' }
    });

    if (transactionCount > 0) {
      throw new Error(`Cannot delete category. It is being used by ${transactionCount} transaction(s).`);
    }

    await category.softDelete();
    return category;
  }

  /**
   * Assign category to transaction
   */
  static async assignCategoryToTransaction(transactionId, categoryId, businessId, assignedBy) {
    // Verify transaction exists and belongs to business
    const transaction = await Transaction.findOne({
      _id: transactionId,
      businessShortCode: businessId // This might need adjustment based on your business ID field
    });

    if (!transaction) {
      throw new Error('Transaction not found or you don\'t have permission to access it.');
    }

    // Verify category exists and belongs to business
    const category = await Category.findOne({
      _id: categoryId,
      businessId,
      isActive: true
    });

    if (!category) {
      throw new Error('Category not found or you don\'t have permission to use it.');
    }

    transaction.categoryId = categoryId;
    transaction.categoryAssignedAt = new Date();
    transaction.categoryAssignedBy = assignedBy;

    await transaction.save();
    await transaction.populate('categoryId', 'name type vatApplicable vatRate kraTaxCode');

    return transaction;
  }

  /**
   * Bulk assign category to transactions
   */
  static async bulkAssignCategory(transactionIds, categoryId, businessId, assignedBy) {
    // Verify category exists
    const category = await Category.findOne({
      _id: categoryId,
      businessId,
      isActive: true
    });

    if (!category) {
      throw new Error('Category not found or you don\'t have permission to use it.');
    }

    // Update transactions
    const result = await Transaction.updateMany(
      {
        _id: { $in: transactionIds },
        businessShortCode: businessId
      },
      {
        categoryId,
        categoryAssignedAt: new Date(),
        categoryAssignedBy: assignedBy
      }
    );

    if (result.matchedCount === 0) {
      throw new Error('No transactions found or you don\'t have permission to access them.');
    }

    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      category: category.getSummary()
    };
  }

  /**
   * Get category usage statistics
   */
  static async getCategoryStatistics(businessId) {
    const stats = await Transaction.aggregate([
      {
        $match: {
          businessShortCode: businessId,
          categoryId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$categoryId',
          transactionCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          lastUsed: { $max: '$transactionTime' }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $project: {
          categoryId: '$_id',
          categoryName: '$category.name',
          categoryType: '$category.type',
          transactionCount: 1,
          totalAmount: 1,
          lastUsed: 1
        }
      },
      {
        $sort: { transactionCount: -1 }
      }
    ]);

    return stats;
  }
}