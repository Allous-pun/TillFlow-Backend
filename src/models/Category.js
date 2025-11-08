import mongoose from "mongoose";

const { Schema } = mongoose;

// Helper function to validate category type
function validateCategoryType(type) {
  return ["income", "expense"].includes(type);
}

// Helper function to validate VAT rate
function validateVatRate(rate) {
  return rate === "exempt" || (typeof rate === "number" && rate >= 0 && rate <= 100);
}

// Helper function to validate KRA tax code format
function validateKraTaxCode(code) {
  return /^[A-Z0-9]{3,10}$/.test(code);
}

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxLength: [100, "Category name cannot exceed 100 characters"],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxLength: [500, "Description cannot exceed 500 characters"],
    },
    type: {
      type: String,
      required: [true, "Category type is required"],
      enum: ["income", "expense"],
      validate: {
        validator: validateCategoryType,
        message: "Category type must be either 'income' or 'expense'"
      },
      index: true,
    },
    vatApplicable: {
      type: Boolean,
      required: [true, "VAT applicability is required"],
      default: false,
    },
    vatRate: {
      type: Schema.Types.Mixed, // Can be number or "exempt"
      required: function() {
        return this.vatApplicable;
      },
      validate: {
        validator: validateVatRate,
        message: "VAT rate must be a number between 0-100 or 'exempt'"
      },
      default: null,
    },
    kraTaxCode: {
      type: String,
      required: [true, "KRA tax code is required for eTIMS integration"],
      validate: {
        validator: validateKraTaxCode,
        message: "KRA tax code must be 3-10 alphanumeric characters"
      },
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator user ID is required"],
    },
    // For system-defined categories vs user-defined
    isSystemCategory: {
      type: Boolean,
      default: false,
    },
    // For categorizing similar categories
    categoryGroup: {
      type: String,
      trim: true,
      maxLength: [50, "Category group cannot exceed 50 characters"],
    },
    // For ordering categories in UI
    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
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

// Compound indexes for unique category names per business
categorySchema.index({ name: 1, businessId: 1 }, { unique: true });
categorySchema.index({ kraTaxCode: 1, businessId: 1 }, { unique: true });

// Virtual for formatted VAT rate display
categorySchema.virtual('formattedVatRate').get(function() {
  if (this.vatRate === "exempt") {
    return "Exempt";
  } else if (typeof this.vatRate === "number") {
    return `${this.vatRate}%`;
  }
  return "N/A";
});

// Virtual for VAT calculation
categorySchema.virtual('vatAmount').get(function() {
  if (!this.vatApplicable || this.vatRate === "exempt" || typeof this.vatRate !== "number") {
    return 0;
  }
  return (amount) => {
    return (amount * this.vatRate) / 100;
  };
});

// Virtual for category type display
categorySchema.virtual('typeDisplay').get(function() {
  return this.type.charAt(0).toUpperCase() + this.type.slice(1);
});

// Pre-save hook to validate VAT consistency
categorySchema.pre("save", function (next) {
  // If VAT is not applicable, clear VAT rate
  if (!this.vatApplicable) {
    this.vatRate = null;
  }
  
  // If VAT is applicable but rate is not set, set default rate (16% for Kenya)
  if (this.vatApplicable && !this.vatRate) {
    this.vatRate = 16;
  }
  
  next();
});

// Pre-save hook to validate type-specific rules
categorySchema.pre("save", function (next) {
  // Add any type-specific validation here if needed
  // For example, certain KRA tax codes might be specific to income or expense
  next();
});

// Static Methods
categorySchema.statics = {
  // Find categories by business
  findByBusiness(businessId, options = {}) {
    const { type, vatApplicable, isActive = true } = options;
    
    let query = { businessId };
    
    if (type) query.type = type;
    if (vatApplicable !== undefined) query.vatApplicable = vatApplicable;
    if (isActive !== undefined) query.isActive = isActive;
    
    return this.find(query)
      .populate('createdBy', 'fullName email')
      .populate('businessId', 'businessName mpesaShortCode')
      .sort({ displayOrder: 1, name: 1 })
      .exec();
  },

  // Find categories by type
  findByType(businessId, type) {
    return this.find({ businessId, type, isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .exec();
  },

  // Find categories by KRA tax code
  findByKraTaxCode(businessId, kraTaxCode) {
    return this.findOne({ businessId, kraTaxCode, isActive: true })
      .populate('businessId', 'businessName mpesaShortCode')
      .exec();
  },

  // Get categories for VAT reporting
  findVatCategories(businessId) {
    return this.find({ 
      businessId, 
      vatApplicable: true,
      isActive: true 
    })
    .sort({ type: 1, name: 1 })
    .exec();
  },

  // Create default categories for a new business
  createDefaultCategories(businessId, userId) {
    const defaultCategories = [
      // Income Categories
      {
        name: "Sales",
        type: "income",
        vatApplicable: true,
        vatRate: 16,
        kraTaxCode: "A1",
        isSystemCategory: true,
        categoryGroup: "Sales",
        displayOrder: 1
      },
      {
        name: "Service Income",
        type: "income",
        vatApplicable: true,
        vatRate: 16,
        kraTaxCode: "A2",
        isSystemCategory: true,
        categoryGroup: "Services",
        displayOrder: 2
      },
      {
        name: "Interest Income",
        type: "income",
        vatApplicable: false,
        kraTaxCode: "B1",
        isSystemCategory: true,
        categoryGroup: "Other Income",
        displayOrder: 3
      },

      // Expense Categories
      {
        name: "Rent",
        type: "expense",
        vatApplicable: true,
        vatRate: 16,
        kraTaxCode: "E1",
        isSystemCategory: true,
        categoryGroup: "Operating Expenses",
        displayOrder: 1
      },
      {
        name: "Salaries",
        type: "expense",
        vatApplicable: false,
        kraTaxCode: "E2",
        isSystemCategory: true,
        categoryGroup: "Personnel",
        displayOrder: 2
      },
      {
        name: "Utilities",
        type: "expense",
        vatApplicable: true,
        vatRate: 16,
        kraTaxCode: "E3",
        isSystemCategory: true,
        categoryGroup: "Operating Expenses",
        displayOrder: 3
      },
      {
        name: "Office Supplies",
        type: "expense",
        vatApplicable: true,
        vatRate: 16,
        kraTaxCode: "E4",
        isSystemCategory: true,
        categoryGroup: "Operating Expenses",
        displayOrder: 4
      }
    ];

    const categoriesWithIds = defaultCategories.map(cat => ({
      ...cat,
      businessId,
      createdBy: userId
    }));

    return this.insertMany(categoriesWithIds);
  }
};

// Instance Methods
categorySchema.methods = {
  // Soft delete category
  softDelete: function() {
    this.isActive = false;
    return this.save();
  },

  // Activate category
  activate: function() {
    this.isActive = true;
    return this.save();
  },

  // Update category with validation
  updateCategory: function(updates) {
    const allowedUpdates = [
      'name', 'description', 'vatApplicable', 'vatRate', 
      'kraTaxCode', 'categoryGroup', 'displayOrder', 'isActive'
    ];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        this[field] = updates[field];
      }
    });
    
    return this.save();
  },

  // Get category summary
  getSummary: function() {
    return {
      id: this._id,
      name: this.name,
      type: this.type,
      typeDisplay: this.typeDisplay,
      vatApplicable: this.vatApplicable,
      vatRate: this.vatRate,
      formattedVatRate: this.formattedVatRate,
      kraTaxCode: this.kraTaxCode,
      isActive: this.isActive,
      categoryGroup: this.categoryGroup,
      displayOrder: this.displayOrder
    };
  },

  // Get full category details
  getFullDetails: function() {
    return {
      ...this.getSummary(),
      description: this.description,
      businessId: this.businessId,
      createdBy: this.createdBy,
      isSystemCategory: this.isSystemCategory,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Validate if category can be used for transaction
  canUseForTransaction: function() {
    return this.isActive;
  },

  // Calculate VAT for an amount
  calculateVat: function(amount) {
    if (!this.vatApplicable || this.vatRate === "exempt") {
      return 0;
    }
    return (amount * this.vatRate) / 100;
  }
};

const Category = mongoose.model("Category", categorySchema);
export default Category;