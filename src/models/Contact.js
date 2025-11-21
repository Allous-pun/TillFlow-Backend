import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  // Email Addresses
  supportEmail: {
    type: String,
    required: true,
    default: "support@tillflow.com",
    trim: true
  },
  generalEmail: {
    type: String,
    required: true,
    default: "info@tillflow.com",
    trim: true
  },
  salesEmail: {
    type: String,
    required: true,
    default: "sales@tillflow.com",
    trim: true
  },
  
  // Phone Numbers
  supportPhone: {
    type: String,
    required: true,
    default: "+1 555 123-4567",
    trim: true
  },
  salesPhone: {
    type: String,
    required: true,
    default: "+1 555 123-4568",
    trim: true
  },
  
  // Business Hours
  businessHours: {
    regularHours: {
      weekdays: {
        type: String,
        default: "Monday - Friday: 9:00 AM - 6:00 PM PST"
      },
      saturday: {
        type: String,
        default: "Saturday: 10:00 AM - 4:00 PM PST"
      },
      sunday: {
        type: String,
        default: "Sunday: Closed"
      }
    },
    emergencySupport: {
      type: String,
      default: "24/7 for critical issues"
    },
    responseTime: {
      general: {
        type: String,
        default: "24 hours for general inquiries"
      },
      urgent: {
        type: String,
        default: "2 hours for urgent issues"
      }
    }
  },
  
  // Office Locations
  offices: {
    headquarters: {
      address: {
        type: String,
        default: "123 Market Street, Suite 500"
      },
      city: {
        type: String,
        default: "San Francisco"
      },
      state: {
        type: String,
        default: "CA"
      },
      zipCode: {
        type: String,
        default: "94103"
      },
      country: {
        type: String,
        default: "United States"
      }
    },
    regionalOffice: {
      address: {
        type: String,
        default: "455 Tech Boulevard"
      },
      city: {
        type: String,
        default: "Austin"
      },
      state: {
        type: String,
        default: "TX"
      },
      zipCode: {
        type: String,
        default: "78701"
      },
      country: {
        type: String,
        default: "United States"
      }
    }
  },
  
  // Social Media
  socialMedia: {
    twitter: {
      type: String,
      default: "@tillflow"
    },
    linkedin: {
      type: String,
      default: "https://linkedin.com/company/tillflow"
    },
    facebook: {
      type: String,
      default: "https://facebook.com/tillflow"
    }
  },
  
  // Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Static Methods
contactSchema.statics = {
  // Ensure only one contact configuration exists
  async getContactConfig() {
    let contact = await this.findOne({ isActive: true });
    if (!contact) {
      contact = await this.create({});
    }
    return contact;
  },

  // Find active contact configuration
  findActive() {
    return this.findOne({ isActive: true }).exec();
  }
};

// Instance Methods
contactSchema.methods = {
  // Get public contact information
  getPublicInfo() {
    return {
      emails: {
        support: this.supportEmail,
        general: this.generalEmail,
        sales: this.salesEmail
      },
      phones: {
        support: this.supportPhone,
        sales: this.salesPhone
      },
      businessHours: this.businessHours,
      offices: this.offices,
      socialMedia: this.socialMedia
    };
  },

  // Get full contact details (admin only)
  getFullDetails() {
    return {
      id: this._id,
      emails: {
        support: this.supportEmail,
        general: this.generalEmail,
        sales: this.salesEmail
      },
      phones: {
        support: this.supportPhone,
        sales: this.salesPhone
      },
      businessHours: this.businessHours,
      offices: this.offices,
      socialMedia: this.socialMedia,
      isActive: this.isActive,
      lastUpdatedBy: this.lastUpdatedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Update contact configuration
  updateConfig(updateData, userId) {
    Object.keys(updateData).forEach(key => {
      if (this[key] !== undefined) {
        this[key] = updateData[key];
      }
    });
    this.lastUpdatedBy = userId;
    return this.save();
  }
};

// Indexes for performance
contactSchema.index({ isActive: 1 });
contactSchema.index({ createdAt: -1 });

export default mongoose.model("Contact", contactSchema);