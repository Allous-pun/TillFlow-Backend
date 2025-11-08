import CategoryRule from "../models/CategoryRule.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import eventBus from '../utils/eventBus.js';

/**
 * Classification Service
 * Handles automatic classification of transactions using rules
 */

// 🆕 ADD EVENT LISTENER FOR AUTO-CLASSIFICATION
eventBus.on("TRANSACTION_CREATED", async (transaction) => {
  try {
    console.log(`🔄 Auto-classifying transaction: ${transaction._id}`);
    
    // Use your existing classification function
    await ClassificationService.classifyTransaction(transaction, transaction.businessShortCode);
    
    console.log(`✅ Auto-classified transaction: ${transaction._id}`);
  } catch (error) {
    console.error(`❌ Auto-classification failed for transaction ${transaction._id}:`, error);
  }
});

export class ClassificationService {
  /**
   * Classify a single transaction using business rules
   */
  static async classifyTransaction(transaction, businessId) {
    const transactionData = {
      paybillNumber: transaction.paybillNumber,
      tillNumber: transaction.tillNumber,
      description: transaction.description
    };

    // Find matching rule
    const matchingRule = await CategoryRule.findMatchingRule(transactionData, businessId);

    if (matchingRule) {
      // Apply the rule and get the category
      const categoryId = matchingRule.applyToTransaction(transactionData);
      
      if (categoryId) {
        // Update transaction with classified category
        await Transaction.findByIdAndUpdate(transaction._id, {
          categoryId,
          categoryAssignedAt: new Date(),
          categoryAssignedBy: 'system', // or null for system assignments
          classificationMethod: 'auto'
        });

        return {
          classified: true,
          rule: matchingRule.getSummary(),
          category: categoryId
        };
      }
    }

    return {
      classified: false,
      rule: null,
      category: null
    };
  }

  /**
   * Bulk classify multiple transactions
   */
  static async bulkClassifyTransactions(transactions, businessId) {
    const results = {
      classified: 0,
      failed: 0,
      details: []
    };

    for (const transaction of transactions) {
      try {
        const classificationResult = await this.classifyTransaction(transaction, businessId);
        
        results.details.push({
          transactionId: transaction._id,
          mpesaTransactionId: transaction.mpesaTransactionId,
          ...classificationResult
        });

        if (classificationResult.classified) {
          results.classified++;
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`Error classifying transaction ${transaction._id}:`, error);
        results.failed++;
        results.details.push({
          transactionId: transaction._id,
          mpesaTransactionId: transaction.mpesaTransactionId,
          classified: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Classify new incoming M-Pesa transactions in real-time
   */
  static async classifyIncomingTransaction(transactionData, businessId) {
    const { paybillNumber, tillNumber, description } = transactionData;

    // Get all active rules for this business, ordered by priority
    const rules = await CategoryRule.find({
      businessId,
      isActive: true
    })
    .populate('categoryId')
    .sort({ priority: 1 })
    .exec();

    // Find the first matching rule
    for (const rule of rules) {
      if (rule.matchesTransaction(transactionData)) {
        // Update rule statistics
        rule.matchCount += 1;
        rule.lastMatched = new Date();
        await rule.save();

        return {
          categoryId: rule.categoryId._id,
          ruleId: rule._id,
          classificationMethod: 'auto',
          confidence: 'high' // Could be calculated based on rule type and match quality
        };
      }
    }

    return null; // No matching rule found
  }

  /**
   * Re-classify all unclassified transactions for a business
   */
  static async reclassifyAllUncategorized(businessId, limit = 1000) {
    // Find unclassified transactions
    const unclassifiedTransactions = await Transaction.find({
      businessShortCode: businessId,
      categoryId: { $exists: false },
      status: { $ne: 'deleted' }
    })
    .limit(limit)
    .exec();

    const results = await this.bulkClassifyTransactions(unclassifiedTransactions, businessId);

    return {
      processed: unclassifiedTransactions.length,
      ...results
    };
  }

  /**
   * Test classification rules against sample data
   */
  static async testClassificationRules(businessId, sampleTransactions) {
    const testResults = {
      totalTested: sampleTransactions.length,
      matches: 0,
      noMatches: 0,
      details: []
    };

    // Get all active rules
    const rules = await CategoryRule.find({
      businessId,
      isActive: true
    })
    .populate('categoryId', 'name type')
    .sort({ priority: 1 })
    .exec();

    for (const sample of sampleTransactions) {
      let matched = false;
      let matchedRule = null;

      for (const rule of rules) {
        if (rule.matchesTransaction(sample)) {
          matched = true;
          matchedRule = rule.getSummary();
          break;
        }
      }

      testResults.details.push({
        sample,
        matched,
        matchedRule
      });

      if (matched) {
        testResults.matches++;
      } else {
        testResults.noMatches++;
      }
    }

    // Calculate effectiveness
    testResults.effectiveness = (testResults.matches / testResults.totalTested) * 100;

    return testResults;
  }

  /**
   * Get classification analytics for a business
   */
  static async getClassificationAnalytics(businessId, period = '30d') {
    const dateFilter = this.getDateFilter(period);

    const analytics = await Transaction.aggregate([
      {
        $match: {
          businessShortCode: businessId,
          transactionTime: dateFilter,
          status: { $ne: 'deleted' }
        }
      },
      {
        $group: {
          _id: {
            hasCategory: { $cond: [{ $ifNull: ['$categoryId', false] }, true, false] },
            method: '$classificationMethod'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $group: {
          _id: '$_id.hasCategory',
          methods: {
            $push: {
              method: '$_id.method',
              count: '$count',
              totalAmount: '$totalAmount'
            }
          },
          totalCount: { $sum: '$count' },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Get rule performance
    const rulePerformance = await CategoryRule.aggregate([
      {
        $match: {
          businessId: new mongoose.Types.ObjectId(businessId), // THIS LINE NEEDED MONGOOSE
          isActive: true
        }
      },
      {
        $project: {
          name: 1,
          triggerType: 1,
          matchCount: 1,
          lastMatched: 1,
          effectiveness: {
            $cond: [
              { $gt: ['$matchCount', 0] },
              'active',
              'inactive'
            ]
          }
        }
      },
      {
        $sort: { matchCount: -1 }
      }
    ]);

    return {
      period,
      transactionAnalytics: analytics,
      rulePerformance,
      summary: this.calculateSummary(analytics)
    };
  }

  /**
   * Helper method to calculate date filter
   */
  static getDateFilter(period) {
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    return { $gte: startDate };
  }

  /**
   * Helper method to calculate classification summary
   */
  static calculateSummary(analytics) {
    let classified = 0;
    let unclassified = 0;
    let autoClassified = 0;
    let manualClassified = 0;

    analytics.forEach(item => {
      if (item._id === true) {
        classified = item.totalCount;
        item.methods.forEach(method => {
          if (method.method === 'auto') {
            autoClassified = method.count;
          } else if (method.method === 'manual') {
            manualClassified = method.count;
          }
        });
      } else {
        unclassified = item.totalCount;
      }
    });

    const total = classified + unclassified;
    const autoClassificationRate = total > 0 ? (autoClassified / total) * 100 : 0;

    return {
      totalTransactions: total,
      classified,
      unclassified,
      autoClassified,
      manualClassified,
      autoClassificationRate: Math.round(autoClassificationRate * 100) / 100
    };
  }
}