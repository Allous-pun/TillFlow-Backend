import CategoryRule from "../models/CategoryRule.js";
import Category from "../models/Category.js";
import mongoose from "mongoose";

/**
 * Category Rule Service
 * Handles business logic for auto-classification rules
 */

export class CategoryRuleService {
  /**
   * Create a new classification rule
   */
  static async createCategoryRule(ruleData, businessId, createdBy) {
    const {
      name,
      description,
      triggerType,
      triggerValue,
      keywordMatchType,
      caseSensitive,
      categoryId,
      priority
    } = ruleData;

    // Validate required fields
    if (!name || !triggerType || !triggerValue || !categoryId) {
      throw new Error('Name, trigger type, trigger value, and category are required fields.');
    }

    // Check for duplicate rule
    const existingRule = await CategoryRule.findOne({
      triggerType,
      triggerValue,
      businessId,
      isActive: true
    });

    if (existingRule) {
      throw new Error('A rule with this trigger already exists for your business.');
    }

    // Verify category exists and belongs to same business
    const category = await Category.findOne({
      _id: categoryId,
      businessId,
      isActive: true
    });

    if (!category) {
      throw new Error('Category not found or does not belong to your business.');
    }

    const rule = new CategoryRule({
      name: name.trim(),
      description: description?.trim(),
      triggerType,
      triggerValue: triggerValue.trim(),
      categoryId,
      businessId,
      createdBy,
      priority: priority || 50,
      ...(triggerType === 'keyword' && {
        keywordMatchType: keywordMatchType || 'contains',
        caseSensitive: caseSensitive || false
      })
    });

    await rule.save();
    await rule.populate('categoryId', 'name type vatApplicable vatRate kraTaxCode');
    await rule.populate('businessId', 'businessName mpesaShortCode');
    await rule.populate('createdBy', 'fullName email');

    return rule;
  }

  /**
   * Get rules with filtering and pagination
   */
  static async getCategoryRules(businessId, filters = {}) {
    const {
      triggerType,
      includeInactive = false,
      page = 1,
      limit = 50
    } = filters;

    const query = { businessId };
    
    if (triggerType && ['till', 'paybill', 'keyword'].includes(triggerType)) {
      query.triggerType = triggerType;
    }

    if (!includeInactive) {
      query.isActive = true;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [rules, total] = await Promise.all([
      CategoryRule.find(query)
        .populate('categoryId', 'name type vatApplicable vatRate kraTaxCode')
        .populate('businessId', 'businessName mpesaShortCode')
        .populate('createdBy', 'fullName email')
        .sort({ priority: 1, triggerType: 1, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .exec(),
      CategoryRule.countDocuments(query)
    ]);

    return {
      rules,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRules: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    };
  }

  /**
   * Get single rule by ID
   */
  static async getCategoryRuleById(ruleId, businessId) {
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      throw new Error('Invalid rule ID format.');
    }

    const rule = await CategoryRule.findOne({
      _id: ruleId,
      businessId
    })
    .populate('categoryId', 'name type vatApplicable vatRate kraTaxCode')
    .populate('businessId', 'businessName mpesaShortCode')
    .populate('createdBy', 'fullName email');

    if (!rule) {
      throw new Error('Rule not found or you don\'t have permission to access it.');
    }

    return rule;
  }

  /**
   * Update rule
   */
  static async updateCategoryRule(ruleId, businessId, updates) {
    const rule = await CategoryRule.findOne({
      _id: ruleId,
      businessId
    });

    if (!rule) {
      throw new Error('Rule not found or you don\'t have permission to update it.');
    }

    // Check for duplicate rule if trigger type or value is being updated
    if ((updates.triggerType || updates.triggerValue) && 
        (updates.triggerType !== rule.triggerType || updates.triggerValue !== rule.triggerValue)) {
      
      const triggerType = updates.triggerType || rule.triggerType;
      const triggerValue = updates.triggerValue || rule.triggerValue;

      const existingRule = await CategoryRule.findOne({
        triggerType,
        triggerValue,
        businessId,
        isActive: true,
        _id: { $ne: ruleId }
      });

      if (existingRule) {
        throw new Error('A rule with this trigger already exists for your business.');
      }
    }

    // Verify category exists if categoryId is being updated
    if (updates.categoryId) {
      const category = await Category.findOne({
        _id: updates.categoryId,
        businessId,
        isActive: true
      });

      if (!category) {
        throw new Error('Category not found or does not belong to your business.');
      }
    }

    await rule.updateRule(updates);
    await rule.populate('categoryId', 'name type vatApplicable vatRate kraTaxCode');
    await rule.populate('businessId', 'businessName mpesaShortCode');
    await rule.populate('createdBy', 'fullName email');

    return rule;
  }

  /**
   * Delete rule (soft delete)
   */
  static async deleteCategoryRule(ruleId, businessId) {
    const rule = await CategoryRule.findOne({
      _id: ruleId,
      businessId
    });

    if (!rule) {
      throw new Error('Rule not found or already deleted.');
    }

    await rule.softDelete();
    return rule;
  }

  /**
   * Test rule against sample data
   */
  static async testCategoryRule(ruleId, businessId, sampleData) {
    const rule = await CategoryRule.findOne({
      _id: ruleId,
      businessId,
      isActive: true
    }).populate('categoryId', 'name type vatApplicable vatRate kraTaxCode');

    if (!rule) {
      throw new Error('Rule not found or inactive.');
    }

    return rule.testRule(sampleData);
  }

  /**
   * Bulk update rule priorities
   */
  static async bulkUpdateRulePriorities(priorities, businessId) {
    // Validate all rule IDs belong to the business
    const ruleIds = priorities.map(p => p.ruleId);
    const validRules = await CategoryRule.find({
      _id: { $in: ruleIds },
      businessId
    });

    if (validRules.length !== ruleIds.length) {
      throw new Error('Some rule IDs are invalid or don\'t belong to your business.');
    }

    const result = await CategoryRule.updatePriorities(priorities);

    return {
      modified: result.modifiedCount,
      total: priorities.length
    };
  }

  /**
   * Get rule statistics
   */
  static async getRuleStatistics(businessId) {
    const stats = await CategoryRule.aggregate([
      { $match: { businessId: new mongoose.Types.ObjectId(businessId) } },
      {
        $group: {
          _id: null,
          totalRules: { $sum: 1 },
          activeRules: { 
            $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } 
          },
          totalMatches: { $sum: "$matchCount" },
          byTriggerType: {
            $push: {
              triggerType: "$triggerType",
              isActive: "$isActive",
              matchCount: "$matchCount"
            }
          }
        }
      },
      {
        $project: {
          totalRules: 1,
          activeRules: 1,
          inactiveRules: { $subtract: ["$totalRules", "$activeRules"] },
          totalMatches: 1,
          averageMatchesPerRule: {
            $cond: [
              { $gt: ["$activeRules", 0] },
              { $divide: ["$totalMatches", "$activeRules"] },
              0
            ]
          },
          triggerTypeBreakdown: {
            $map: {
              input: ["till", "paybill", "keyword"],
              as: "type",
              in: {
                triggerType: "$$type",
                count: {
                  $size: {
                    $filter: {
                      input: "$byTriggerType",
                      as: "rule",
                      cond: { 
                        $and: [
                          { $eq: ["$$rule.triggerType", "$$type"] },
                          { $eq: ["$$rule.isActive", true] }
                        ]
                      }
                    }
                  }
                },
                matches: {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: "$byTriggerType",
                          as: "rule",
                          cond: { 
                            $and: [
                              { $eq: ["$$rule.triggerType", "$$type"] },
                              { $eq: ["$$rule.isActive", true] }
                            ]
                          }
                        }
                      },
                      as: "filteredRule",
                      in: "$$filteredRule.matchCount"
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    return stats.length > 0 ? stats[0] : {
      totalRules: 0,
      activeRules: 0,
      inactiveRules: 0,
      totalMatches: 0,
      averageMatchesPerRule: 0,
      triggerTypeBreakdown: []
    };
  }

  /**
   * Reset rule statistics
   */
  static async resetRuleStatistics(ruleId, businessId) {
    const rule = await CategoryRule.findOne({
      _id: ruleId,
      businessId
    });

    if (!rule) {
      throw new Error('Rule not found.');
    }

    await rule.resetStats();
    return rule;
  }
}