import Transaction from "../models/Transaction.js";
import { parseCsvTransactions } from "../utils/manualCsvParser.js";
import { parsePdfTransactions } from "../utils/manualPdfParser.js";
import mongoose from "mongoose";

/**
 * Manual Import Controller
 * Handles both PDF & CSV uploads
 * Gives detailed per-row/transaction feedback
 */

export const uploadManualTransactions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please attach a PDF or CSV file.",
      });
    }

    const { merchantId, businessShortCode } = req.body;

    if (!merchantId || !businessShortCode) {
      return res.status(400).json({
        success: false,
        message: "merchantId and businessShortCode are required.",
      });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();

    let parsedTransactions = [];

    if (ext === "csv") {
      parsedTransactions = await parseCsvTransactions(req.file.path);
    } else if (ext === "pdf") {
      parsedTransactions = await parsePdfTransactions(req.file.path);
    } else {
      return res.status(400).json({
        success: false,
        message: "Unsupported file type. Only CSV or PDF allowed.",
      });
    }

    if (!parsedTransactions.length) {
      return res.status(422).json({
        success: false,
        message: "The uploaded file contains no readable transactions.",
      });
    }

    // Transform parsed data → Transaction schema format
    const docs = parsedTransactions.map(txn => ({
      mpesaTransactionId: txn.id,
      amount: txn.amount,
      transactionTime: txn.date,
      transactionType: txn.type,
      businessShortCode,
      merchant: new mongoose.Types.ObjectId(merchantId),
      billRefNumber: txn.reference || null,
      customer: {
        phoneNumber: txn.phoneNumber,
        name: txn.name || "",
      },
      source: ext === "csv" ? "manual-csv" : "manual-pdf",
      rawMpesaResponse: txn.raw || null
    }));

    // Insert ignoring duplicates (unique index on mpesaTransactionId)
    const result = await Transaction.insertMany(docs, { ordered: false });

    return res.status(201).json({
      success: true,
      message: "Manual import completed.",
      inserted: result.length,
      ignoredDuplicates: parsedTransactions.length - result.length,
      totalProcessed: parsedTransactions.length,
    });

  } catch (error) {
    if (error.writeErrors) {
      return res.status(207).json({
        success: true,
        message: "Some transactions failed due to duplicates.",
        inserted: error.insertedDocs?.length || 0,
        duplicates: error.writeErrors.length,
      });
    }

    console.error("Manual transaction upload error → ", error);

    return res.status(500).json({
      success: false,
      message: "Server error during transaction import.",
      error: error.message
    });
  }
};
