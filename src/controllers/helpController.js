import { HelpService } from "../services/helpService.js";

/**
 * Help Controller
 * Handles HTTP requests for help & documentation operations
 */

export const createHelp = async (req, res) => {
  try {
    const createdBy = req.user?._id;

    const help = await HelpService.createHelp(req.body, createdBy);

    return res.status(201).json({
      success: true,
      message: "Help item created successfully.",
      data: help.getFullDetails(),
    });

  } catch (error) {
    console.error("Create help item error → ", error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: errors
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating help item.",
      error: error.message
    });
  }
};

export const listHelpItems = async (req, res) => {
  try {
    const {
      category,
      type,
      isFeatured,
      search,
      status = 'published',
      page = 1,
      limit = 20,
      sortBy = 'displayOrder',
      sortOrder = 'asc'
    } = req.query;

    const filters = {
      category,
      type,
      isFeatured: isFeatured !== undefined ? isFeatured === 'true' : undefined,
      search,
      status: req.user?.role === 'admin' ? status : 'published', // Only admins can see non-published items
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    };

    const result = await HelpService.getHelpItems(filters);

    // Transform help items to include summary
    const helpItemsData = result.helpItems.map(help => help.getSummary());

    return res.status(200).json({
      success: true,
      message: "Help items retrieved successfully.",
      data: {
        helpItems: helpItemsData,
        pagination: result.pagination,
        filters: {
          category: category || 'all',
          type: type || 'all',
          isFeatured: isFeatured || 'all',
          search: search || '',
          status: filters.status
        }
      },
    });

  } catch (error) {
    console.error("List help items error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving help items.",
      error: error.message
    });
  }
};

export const getHelp = async (req, res) => {
  try {
    const { id } = req.params;
    const incrementViews = req.query.incrementViews === 'true';

    const help = await HelpService.getHelpById(id, incrementViews);

    return res.status(200).json({
      success: true,
      message: "Help item retrieved successfully.",
      data: help.getFullDetails(),
    });

  } catch (error) {
    console.error("Get help item error → ", error);

    if (error.message.includes('Invalid help item ID') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving help item.",
      error: error.message
    });
  }
};

export const updateHelp = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedBy = req.user?._id;
    const updates = req.body;

    const help = await HelpService.updateHelp(id, updates, updatedBy);

    return res.status(200).json({
      success: true,
      message: "Help item updated successfully.",
      data: help.getFullDetails(),
    });

  } catch (error) {
    console.error("Update help item error → ", error);

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
      message: "Server error while updating help item.",
      error: error.message
    });
  }
};

export const deleteHelp = async (req, res) => {
  try {
    const { id } = req.params;

    const help = await HelpService.deleteHelp(id);

    return res.status(200).json({
      success: true,
      message: "Help item deleted successfully.",
      data: {
        id: help._id,
        title: help.title,
        status: help.status,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    console.error("Delete help item error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while deleting help item.",
      error: error.message
    });
  }
};

export const publishHelp = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedBy = req.user?._id;

    const help = await HelpService.publishHelp(id, updatedBy);

    return res.status(200).json({
      success: true,
      message: "Help item published successfully.",
      data: help.getSummary(),
    });

  } catch (error) {
    console.error("Publish help item error → ", error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while publishing help item.",
      error: error.message
    });
  }
};

export const recordFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { wasHelpful } = req.body;

    if (typeof wasHelpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "wasHelpful field is required and must be a boolean.",
      });
    }

    const help = await HelpService.recordFeedback(id, wasHelpful);

    return res.status(200).json({
      success: true,
      message: `Feedback recorded as ${wasHelpful ? 'helpful' : 'not helpful'}.`,
      data: {
        id: help._id,
        title: help.title,
        helpfulCount: help.helpfulCount,
        notHelpfulCount: help.notHelpfulCount,
        helpfulPercentage: help.helpfulPercentage
      }
    });

  } catch (error) {
    console.error("Record feedback error → ", error);

    if (error.message.includes('Invalid help item ID') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while recording feedback.",
      error: error.message
    });
  }
};

export const getHelpStatistics = async (req, res) => {
  try {
    const statistics = await HelpService.getHelpStatistics();

    return res.status(200).json({
      success: true,
      message: "Help statistics retrieved successfully.",
      data: statistics,
    });

  } catch (error) {
    console.error("Get help statistics error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving help statistics.",
      error: error.message
    });
  }
};

export const searchHelp = async (req, res) => {
  try {
    const { q: searchTerm, category, type, limit = 10 } = req.query;

    if (!searchTerm || searchTerm.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search term must be at least 2 characters long.",
      });
    }

    const filters = {
      category,
      type,
      limit: parseInt(limit)
    };

    const helpItems = await HelpService.searchHelpItems(searchTerm.trim(), filters);

    const helpItemsData = helpItems.map(help => help.getSummary());

    return res.status(200).json({
      success: true,
      message: "Search completed successfully.",
      data: {
        searchTerm: searchTerm.trim(),
        results: helpItemsData,
        totalResults: helpItems.length,
        filters: {
          category: category || 'all',
          type: type || 'all'
        }
      },
    });

  } catch (error) {
    console.error("Search help items error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while searching help items.",
      error: error.message
    });
  }
};

export const getFeaturedHelp = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const helpItems = await HelpService.getFeaturedHelpItems(parseInt(limit));

    const helpItemsData = helpItems.map(help => help.getSummary());

    return res.status(200).json({
      success: true,
      message: "Featured help items retrieved successfully.",
      data: helpItemsData,
    });

  } catch (error) {
    console.error("Get featured help items error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving featured help items.",
      error: error.message
    });
  }
};

export const getHelpByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 10 } = req.query;

    const validCategories = ['getting-started', 'payments', 'security', 'user-management', 'account', 'development'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category. Must be one of: " + validCategories.join(', '),
      });
    }

    const helpItems = await HelpService.getHelpByCategory(category, parseInt(limit));

    const helpItemsData = helpItems.map(help => help.getSummary());

    return res.status(200).json({
      success: true,
      message: `Help items for ${category} retrieved successfully.`,
      data: helpItemsData,
    });

  } catch (error) {
    console.error("Get help by category error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error while retrieving help items by category.",
      error: error.message
    });
  }
};