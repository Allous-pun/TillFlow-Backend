import Help from "../models/Help.js";
import mongoose from "mongoose";

/**
 * Help Service
 * Handles business logic for help & documentation operations
 */

export class HelpService {
  /**
   * Create a new help item
   */
  static async createHelp(helpData, createdBy) {
    const {
      title,
      description,
      content,
      type,
      category,
      mediaUrl,
      fileType,
      fileSize,
      duration,
      keywords,
      searchTerms,
      displayOrder
    } = helpData;

    // Check for duplicate title
    const existingHelp = await Help.findOne({
      title,
      status: { $ne: 'archived' }
    });

    if (existingHelp) {
      throw new Error('A help item with this title already exists.');
    }

    const help = new Help({
      title: title.trim(),
      description: description.trim(),
      content: content.trim(),
      type,
      category,
      mediaUrl,
      fileType: fileType || 'none',
      fileSize: fileSize || 0,
      duration,
      keywords: keywords || [],
      searchTerms: searchTerms || [],
      displayOrder: displayOrder || 0,
      createdBy,
      updatedBy: createdBy
    });

    await help.save();
    await help.populate('createdBy', 'fullName email');
    await help.populate('updatedBy', 'fullName email');

    return help;
  }

  /**
   * Get help items with filtering and pagination
   */
  static async getHelpItems(filters = {}) {
    const {
      category,
      type,
      isFeatured,
      search,
      status = 'published', // Default to published for non-admin users
      page = 1,
      limit = 20,
      sortBy = 'displayOrder',
      sortOrder = 'asc'
    } = filters;

    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }

    if (category) query.category = category;
    if (type) query.type = type;
    if (isFeatured !== undefined) query.isFeatured = isFeatured;

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [helpItems, total] = await Promise.all([
      Help.find(query)
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .exec(),
      Help.countDocuments(query)
    ]);

    return {
      helpItems,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    };
  }

  /**
   * Get single help item by ID
   */
  static async getHelpById(helpId, incrementViews = false) {
    if (!mongoose.Types.ObjectId.isValid(helpId)) {
      throw new Error('Invalid help item ID format.');
    }

    let help = await Help.findById(helpId)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');

    if (!help) {
      throw new Error('Help item not found.');
    }

    // Increment view count if requested
    if (incrementViews && help.status === 'published') {
      help = await Help.incrementViewCount(helpId);
      await help.populate('createdBy', 'fullName email');
      await help.populate('updatedBy', 'fullName email');
    }

    return help;
  }

  /**
   * Update help item
   */
  static async updateHelp(helpId, updates, updatedBy) {
    const help = await Help.findById(helpId);

    if (!help) {
      throw new Error('Help item not found.');
    }

    // Check for duplicate title
    if (updates.title && updates.title !== help.title) {
      const existingHelp = await Help.findOne({
        title: updates.title,
        status: { $ne: 'archived' },
        _id: { $ne: helpId }
      });

      if (existingHelp) {
        throw new Error('A help item with this title already exists.');
      }
    }

    // Update the help item
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        help[key] = updates[key];
      }
    });

    help.updatedBy = updatedBy;
    await help.save();
    await help.populate('createdBy', 'fullName email');
    await help.populate('updatedBy', 'fullName email');

    return help;
  }

  /**
   * Delete help item (soft delete by archiving)
   */
  static async deleteHelp(helpId) {
    const help = await Help.findById(helpId);

    if (!help) {
      throw new Error('Help item not found.');
    }

    await help.archive();
    return help;
  }

  /**
   * Publish help item
   */
  static async publishHelp(helpId, updatedBy) {
    const help = await Help.findById(helpId);

    if (!help) {
      throw new Error('Help item not found.');
    }

    await help.publish();
    help.updatedBy = updatedBy;
    await help.save();
    await help.populate('createdBy', 'fullName email');
    await help.populate('updatedBy', 'fullName email');

    return help;
  }

  /**
   * Record feedback for help item
   */
  static async recordFeedback(helpId, wasHelpful) {
    if (!mongoose.Types.ObjectId.isValid(helpId)) {
      throw new Error('Invalid help item ID format.');
    }

    const help = await Help.recordFeedback(helpId, wasHelpful);

    if (!help) {
      throw new Error('Help item not found.');
    }

    return help;
  }

  /**
   * Get help statistics
   */
  static async getHelpStatistics() {
    const stats = await Help.getStatistics();

    // Format the statistics
    const formattedStats = {
      totalItems: stats.totalItems,
      totalViews: stats.totalViews,
      statusCounts: {
        draft: 0,
        published: 0,
        archived: 0
      },
      categoryCounts: {},
      typeCounts: {}
    };

    // Populate status counts
    stats.statusCounts.forEach(item => {
      formattedStats.statusCounts[item.status] = item.count;
    });

    // Populate category counts
    stats.categoryCounts.forEach(item => {
      formattedStats.categoryCounts[item._id] = item.count;
    });

    // Get type counts
    const typeCounts = await Help.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    typeCounts.forEach(item => {
      formattedStats.typeCounts[item._id] = item.count;
    });

    return formattedStats;
  }

  /**
   * Search help items
   */
  static async searchHelpItems(searchTerm, filters = {}) {
    const {
      category,
      type,
      limit = 10
    } = filters;

    const query = {
      status: 'published',
      $text: { $search: searchTerm }
    };

    if (category) query.category = category;
    if (type) query.type = type;

    const helpItems = await Help.find(query)
      .populate('createdBy', 'fullName email')
      .select('title description category type viewCount helpfulCount')
      .sort({ score: { $meta: 'textScore' } })
      .limit(parseInt(limit))
      .exec();

    return helpItems;
  }

  /**
   * Get featured help items
   */
  static async getFeaturedHelpItems(limit = 5) {
    const helpItems = await Help.find({
      status: 'published',
      isFeatured: true
    })
      .populate('createdBy', 'fullName email')
      .sort({ displayOrder: 1, viewCount: -1 })
      .limit(parseInt(limit))
      .exec();

    return helpItems;
  }

  /**
   * Get help items by category
   */
  static async getHelpByCategory(category, limit = 10) {
    const helpItems = await Help.find({
      status: 'published',
      category
    })
      .populate('createdBy', 'fullName email')
      .sort({ displayOrder: 1, viewCount: -1 })
      .limit(parseInt(limit))
      .exec();

    return helpItems;
  }
}