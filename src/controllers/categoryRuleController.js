import { CategoryRuleService } from "../services/categoryRuleService.js";
import { ClassificationService } from "../services/classificationService.js";

/**
 * Category Rule Controller
 * Handles HTTP requests for auto-classification rules
 */

export const createCategoryRule = async (req, res) => {
  try {
    const businessId = req.business?._id || req.body.businessId;
    const createdBy = req.user?._id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required.",
      });
    }

    const rule = await CategoryRuleService.createCategoryRule(
      req.body,
      businessId,
      createdBy
    );

    return res.status(201).json({
      success: true,
      message: "Classification rule created successfully.",
      data: rule.getFullDetails(),
    });

  } catch (error) {
    console.error("Create category rule error → ", error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors
      });
    }

    if (error.message.includes('already exists') || error.message.includes('not found')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating classification rule.",
      error: error.message
    });
  }
};

export const listCategoryRules = async (req, res) => {
  try {
    const businessId = req.business?._id || req.query.businessId;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required.",
      });
    }

    const { 
      triggerType, 
      includeInactive = false,
      page = 1,
      limit = 50
    } = req.query;

    const filters = {
      triggerType,
      includeInactive: includeInactive === 'true',
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await CategoryRuleService.getCategoryRules(businessId, filters);

    // Transform rules to include summary
    const rulesData = result.rules.map(rule => rule.getSummary());

    return res.status(200).json({
      success: true,
      message: "Classification rules retrieved successfully.",
      data: {
        rules: rulesData,
        pagination: result.pagination,
        filters: {
          triggerType: triggerType || 'all',
          includeInactive: includeInactive === 'true'
        }
      },
    });

  } catch (error) {
    console.error("List category rules error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving classification rules.",
      error: error.message
    });
  }
};

export const getCategoryRule = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const rule = await CategoryRuleService.getCategoryRuleById(id, businessId);

    return res.status(200).json({
      success: true,
      message: "Classification rule retrieved successfully.",
      data: rule.getFullDetails(),
    });

  } catch (error) {
    console.error("Get category rule error → ", error);

    if (error.message.includes('Invalid rule ID') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving classification rule.",
      error: error.message
    });
  }
};

export const updateCategoryRule = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;
    const updates = req.body;

    const rule = await CategoryRuleService.updateCategoryRule(
      id,
      businessId,
      updates
    );

    return res.status(200).json({
      success: true,
      message: "Classification rule updated successfully.",
      data: rule.getFullDetails(),
    });

  } catch (error) {
    console.error("Update category rule error → ", error);

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
      message: "Server error while updating classification rule.",
      error: error.message
    });
  }
};

export const deleteCategoryRule = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const rule = await CategoryRuleService.deleteCategoryRule(id, businessId);

    return res.status(200).json({
      success: true,
      message: "Classification rule deleted successfully.",
      data: {
        id: rule._id,
        name: rule.name,
        triggerType: rule.triggerType,
        triggerValue: rule.triggerValue,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    console.error("Delete category rule error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deleting classification rule.",
      error: error.message
    });
  }
};

export const testCategoryRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { sampleData } = req.body;
    const businessId = req.business?._id;

    if (!sampleData || (!sampleData.paybillNumber && !sampleData.tillNumber && !sampleData.description)) {
      return res.status(400).json({
        success: false,
        message: "Sample data with paybillNumber, tillNumber, or description is required.",
      });
    }

    const testResult = await CategoryRuleService.testCategoryRule(
      id,
      businessId,
      sampleData
    );

    return res.status(200).json({
      success: true,
      message: "Rule test completed successfully.",
      data: testResult,
    });

  } catch (error) {
    console.error("Test category rule error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while testing classification rule.",
      error: error.message
    });
  }
};

export const bulkUpdateRulePriorities = async (req, res) => {
  try {
    const { priorities } = req.body;
    const businessId = req.business?._id;

    if (!priorities || !Array.isArray(priorities) || priorities.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Priorities array is required.",
      });
    }

    const result = await CategoryRuleService.bulkUpdateRulePriorities(
      priorities,
      businessId
    );

    return res.status(200).json({
      success: true,
      message: "Rule priorities updated successfully.",
      data: result,
    });

  } catch (error) {
    console.error("Bulk update rule priorities error → ", error);

    if (error.message.includes('invalid') || error.message.includes('not belong')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating rule priorities.",
      error: error.message
    });
  }
};

export const getRuleStatistics = async (req, res) => {
  try {
    const businessId = req.business?._id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID is required.",
      });
    }

    const statistics = await CategoryRuleService.getRuleStatistics(businessId);

    return res.status(200).json({
      success: true,
      message: "Rule statistics retrieved successfully.",
      data: statistics,
    });

  } catch (error) {
    console.error("Get rule statistics error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving rule statistics.",
      error: error.message
    });
  }
};

export const testClassification = async (req, res) => {
  try {
    const businessId = req.business?._id;
    const { sampleTransactions } = req.body;

    if (!sampleTransactions || !Array.isArray(sampleTransactions)) {
      return res.status(400).json({
        success: false,
        message: "Sample transactions array is required.",
      });
    }

    const testResults = await ClassificationService.testClassificationRules(
      businessId,
      sampleTransactions
    );

    return res.status(200).json({
      success: true,
      message: "Classification test completed successfully.",
      data: testResults,
    });

  } catch (error) {
    console.error("Test classification error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while testing classification.",
      error: error.message
    });
  }
};

export const getClassificationAnalytics = async (req, res) => {
  try {
    const businessId = req.business?._id;
    const { period = '30d' } = req.query;

    const analytics = await ClassificationService.getClassificationAnalytics(
      businessId,
      period
    );

    return res.status(200).json({
      success: true,
      message: "Classification analytics retrieved successfully.",
      data: analytics,
    });

  } catch (error) {
    console.error("Get classification analytics error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving classification analytics.",
      error: error.message
    });
  }
};

export const reclassifyTransactions = async (req, res) => {
  try {
    const businessId = req.business?._id;
    const { limit = 1000 } = req.body;

    const result = await ClassificationService.reclassifyAllUncategorized(
      businessId,
      limit
    );

    return res.status(200).json({
      success: true,
      message: "Reclassification completed successfully.",
      data: result,
    });

  } catch (error) {
    console.error("Reclassify transactions error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while reclassifying transactions.",
      error: error.message
    });
  }
};

// ADD THE MISSING EXPORTS - THESE WERE MISSING
export const activateCategoryRule = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const rule = await CategoryRuleService.updateCategoryRule(
      id,
      businessId,
      { isActive: true }
    );

    return res.status(200).json({
      success: true,
      message: "Classification rule activated successfully.",
      data: rule.getSummary(),
    });

  } catch (error) {
    console.error("Activate category rule error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while activating classification rule.",
      error: error.message
    });
  }
};

export const deactivateCategoryRule = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const rule = await CategoryRuleService.updateCategoryRule(
      id,
      businessId,
      { isActive: false }
    );

    return res.status(200).json({
      success: true,
      message: "Classification rule deactivated successfully.",
      data: rule.getSummary(),
    });

  } catch (error) {
    console.error("Deactivate category rule error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deactivating classification rule.",
      error: error.message
    });
  }
};

export const resetRuleStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.business?._id;

    const rule = await CategoryRuleService.resetRuleStatistics(id, businessId);

    return res.status(200).json({
      success: true,
      message: "Rule statistics reset successfully.",
      data: rule.getSummary(),
    });

  } catch (error) {
    console.error("Reset rule statistics error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while resetting rule statistics.",
      error: error.message
    });
  }
};