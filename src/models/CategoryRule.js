import mongoose from "mongoose";

const { Schema } = mongoose;

// Helper function to validate trigger type
function validateTriggerType(type) {
  return ["till", "paybill", "keyword"].includes(type);
}

// Helper function to validate trigger value based on type
function validateTriggerValue(value, type) {
  switch (type) {
    case "till":
      // Till numbers are typically 5-7 digits in Kenya
      return /^\d{5,7}$/.test(value);
    case "paybill":
      // Paybill numbers are typically 5-10 digits
      return /^\d{5,10}$/.test(value);
    case "keyword":
      // Keywords should be meaningful (2-50 chars)
      return value && value.length >= 2 && value.length <= 50;
    default:
      return false;
  }
}

// Helper function to validate priority
function validatePriority(priority) {
  return Number.isInteger(priority) && priority >= 1 && priority <= 100;
}

const categoryRuleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Rule name is required"],
      trim: true,
      maxLength: [100, "Rule name cannot exceed 100 characters"],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxLength: [500, "Description cannot exceed 500 characters"],
    },
    triggerType: {
      type: String,
      required: [true, "Trigger type is required"],
      enum: ["till", "paybill", "keyword"],
      validate: {
        validator: validateTriggerType,
        message: "Trigger type must be 'till', 'paybill', or 'keyword'"
      },
      index: true,
    },
    triggerValue: {
      type: String,
      required: [true, "Trigger value is required"],
      validate: {
        validator: function(value) {
          return validateTriggerValue(value, this.triggerType);
        },
        message: "Trigger value is invalid for the selected trigger type"
      },
      index: true,
    },
    // For keyword rules, we can specify matching behavior
    keywordMatchType: {
      type: String,
      enum: ["exact", "contains", "startsWith", "endsWith"],
      default: "contains",
      required: function() {
        return this.triggerType === "keyword";
      }
    },
    // Case sensitivity for keyword matches
    caseSensitive: {
      type: Boolean,
      default: false,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category ID is required"],
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: [true, "Business ID is required"],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Priority for rule execution (1-100, 1 being highest)
    priority: {
      type: Number,
      required: [true, "Priority is required"],
      default: 50,
      validate: {
        validator: validatePriority,
        message: "Priority must be an integer between 1 and 100"
      },
      index: true,
    },
    // Rule success metrics
    matchCount: {
      type: Number,
      default: 0,
    },
    lastMatched: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator user ID is required"],
    },
    // For system-defined rules vs user-defined
    isSystemRule: {
      type: Boolean,
      default: false,
    }
  },
  { 
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      }
    }
  }
);

// Compound indexes for unique rules per business
categoryRuleSchema.index({ triggerType: 1, triggerValue: 1, businessId: 1 }, { unique: true });
categoryRuleSchema.index({ businessId: 1, priority: 1 });
categoryRuleSchema.index({ businessId: 1, isActive: 1 });

// Virtual for formatted trigger display
categoryRuleSchema.virtual('formattedTrigger').get(function() {
  switch (this.triggerType) {
    case "till":
      return `Till: ${this.triggerValue}`;
    case "paybill":
      return `Paybill: ${this.triggerValue}`;
    case "keyword":
      const caseText = this.caseSensitive ? " (case-sensitive)" : "";
      return `Keyword: ${this.triggerValue} [${this.keywordMatchType}${caseText}]`;
    default:
      return this.triggerValue;
  }
});

// Virtual for rule effectiveness
categoryRuleSchema.virtual('effectiveness').get(function() {
  if (this.matchCount === 0) return "Never used";
  if (this.matchCount < 5) return "Rarely used";
  if (this.matchCount < 20) return "Occasionally used";
  if (this.matchCount < 100) return "Frequently used";
  return "Heavily used";
});

// Pre-save hook to normalize trigger values
categoryRuleSchema.pre("save", function (next) {
  // Normalize trigger values
  if (this.triggerType === "keyword" && !this.caseSensitive) {
    this.triggerValue = this.triggerValue.toLowerCase();
  }
  
  // For till and paybill, ensure they're stored as numbers only
  if (this.triggerType === "till" || this.triggerType === "paybill") {
    this.triggerValue = this.triggerValue.replace(/\D/g, '');
  }
  
  next();
});

// Pre-save hook to validate category exists and belongs to same business
categoryRuleSchema.pre("save", async function (next) {
  try {
    const Category = mongoose.model("Category");
    const category = await Category.findOne({ 
      _id: this.categoryId, 
      businessId: this.businessId,
      isActive: true 
    });
    
    if (!category) {
      throw new Error('Category not found or does not belong to this business');
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Static Methods
categoryRuleSchema.statics = {
  // Find rules by business
  findByBusiness(businessId, options = {}) {
    const { triggerType, isActive = true } = options;
    
    let query = { businessId };
    
    if (triggerType) query.triggerType = triggerType;
    if (isActive !== undefined) query.isActive = isActive;
    
    return this.find(query)
      .populate('categoryId', 'name type vatApplicable vatRate kraTaxCode')
      .populate('createdBy', 'fullName email')
      .sort({ priority: 1, triggerType: 1, triggerValue: 1 })
      .exec();
  },

  // Find matching rule for a transaction
  findMatchingRule(transactionData, businessId) {
    const { paybillNumber, tillNumber, description } = transactionData;
    
    return this.find({ 
      businessId, 
      isActive: true 
    })
    .populate('categoryId', 'name type vatApplicable vatRate kraTaxCode')
    .sort({ priority: 1 })
    .exec()
    .then(rules => {
      for (const rule of rules) {
        if (rule.matchesTransaction(transactionData)) {
          return rule;
        }
      }
      return null;
    });
  },

  // Create default rules for a new business
  createDefaultRules(businessId, userId) {
    const defaultRules = [
      // Utility paybills
      {
        name: "KPLC Electricity",
        triggerType: "paybill",
        triggerValue: "888888",
        priority: 10,
        isSystemRule: true
      },
      {
        name: "Nairobi Water",
        triggerType: "paybill",
        triggerValue: "888999",
        priority: 10,
        isSystemRule: true
      },
      
      // Common keyword rules
      {
        name: "Rent Payment",
        triggerType: "keyword",
        triggerValue: "rent",
        keywordMatchType: "contains",
        priority: 20,
        isSystemRule: true
      },
      {
        name: "Salary Payment",
        triggerType: "keyword",
        triggerValue: "salary",
        keywordMatchType: "contains",
        priority: 20,
        isSystemRule: true
      },
      {
        name: "Internet Payment",
        triggerType: "keyword",
        triggerValue: "internet",
        keywordMatchType: "contains",
        priority: 30,
        isSystemRule: true
      },
      {
        name: "Office Supplies",
        triggerType: "keyword",
        triggerValue: "stationery",
        keywordMatchType: "contains",
        priority: 40,
        isSystemRule: true
      }
    ];

    // Note: categoryId will need to be set based on actual category IDs
    const rulesWithIds = defaultRules.map(rule => ({
      ...rule,
      businessId,
      createdBy: userId
    }));

    return this.insertMany(rulesWithIds);
  },

  // Bulk update rule priorities
  updatePriorities(rulePriorities) {
    const bulkOps = rulePriorities.map(({ ruleId, priority }) => ({
      updateOne: {
        filter: { _id: ruleId },
        update: { priority }
      }
    }));
    
    return this.bulkWrite(bulkOps);
  }
};

// Instance Methods
categoryRuleSchema.methods = {
  // Check if this rule matches a transaction
  matchesTransaction(transactionData) {
    const { paybillNumber, tillNumber, description } = transactionData;
    
    switch (this.triggerType) {
      case "paybill":
        return paybillNumber && paybillNumber === this.triggerValue;
        
      case "till":
        return tillNumber && tillNumber === this.triggerValue;
        
      case "keyword":
        if (!description) return false;
        
        const searchText = this.caseSensitive ? description : description.toLowerCase();
        const keyword = this.caseSensitive ? this.triggerValue : this.triggerValue.toLowerCase();
        
        switch (this.keywordMatchType) {
          case "exact":
            return searchText === keyword;
          case "contains":
            return searchText.includes(keyword);
          case "startsWith":
            return searchText.startsWith(keyword);
          case "endsWith":
            return searchText.endsWith(keyword);
          default:
            return searchText.includes(keyword);
        }
        
      default:
        return false;
    }
  },

  // Apply rule to transaction and return category
  applyToTransaction(transactionData) {
    if (this.matchesTransaction(transactionData)) {
      this.matchCount += 1;
      this.lastMatched = new Date();
      this.save();
      return this.categoryId;
    }
    return null;
  },

  // Soft delete rule
  softDelete: function() {
    this.isActive = false;
    return this.save();
  },

  // Activate rule
  activate: function() {
    this.isActive = true;
    return this.save();
  },

  // Update rule with validation
  updateRule: function(updates) {
    const allowedUpdates = [
      'name', 'description', 'triggerType', 'triggerValue', 
      'keywordMatchType', 'caseSensitive', 'categoryId', 
      'priority', 'isActive'
    ];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        this[field] = updates[field];
      }
    });
    
    return this.save();
  },

  // Test rule against sample data
  testRule: function(sampleData) {
    const matches = this.matchesTransaction(sampleData);
    return {
      matches,
      matchedRule: matches ? this.getSummary() : null,
      sampleData
    };
  },

  // Get rule summary
  getSummary: function() {
    return {
      id: this._id,
      name: this.name,
      triggerType: this.triggerType,
      formattedTrigger: this.formattedTrigger,
      priority: this.priority,
      isActive: this.isActive,
      matchCount: this.matchCount,
      effectiveness: this.effectiveness,
      lastMatched: this.lastMatched
    };
  },

  // Get full rule details
  getFullDetails: function() {
    return {
      ...this.getSummary(),
      description: this.description,
      triggerValue: this.triggerValue,
      keywordMatchType: this.keywordMatchType,
      caseSensitive: this.caseSensitive,
      categoryId: this.categoryId,
      businessId: this.businessId,
      createdBy: this.createdBy,
      isSystemRule: this.isSystemRule,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Reset match statistics
  resetStats: function() {
    this.matchCount = 0;
    this.lastMatched = null;
    return this.save();
  }
};

const CategoryRule = mongoose.model("CategoryRule", categoryRuleSchema);
export default CategoryRule;