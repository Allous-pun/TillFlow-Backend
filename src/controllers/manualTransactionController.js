import Transaction from "../models/Transaction.js";
import { parseCsvTransactions } from "../utils/manualCsvParser.js";
import { parsePdfTransactions } from "../utils/manualPdfParser.js";
import mongoose from "mongoose";
import fs from "fs";

/**
 * Manual Import Controller
 * Handles both PDF & CSV uploads with password support for PDFs
 * Gives detailed per-row/transaction feedback
 */

export const uploadManualTransactions = async (req, res) => {
  let tempFilePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please attach a PDF or CSV file.",
      });
    }

    tempFilePath = req.file.path;

    const { merchantId, businessShortCode, pdfPassword } = req.body;

    if (!merchantId || !businessShortCode) {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(400).json({
        success: false,
        message: "merchantId and businessShortCode are required.",
      });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();

    let parsedTransactions = [];

    if (ext === "csv") {
      parsedTransactions = await parseCsvTransactions(tempFilePath);
    } else if (ext === "pdf") {
      // For PDF files, require password
      if (!pdfPassword) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        return res.status(400).json({
          success: false,
          message: "PDF password is required. Please enter the 6-digit code from your SMS.",
        });
      }

      // Validate password format (6 digits)
      if (!/^\d{6}$/.test(pdfPassword)) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        return res.status(400).json({
          success: false,
          message: "Invalid password format. Please enter exactly 6 digits.",
        });
      }

      try {
        parsedTransactions = await parsePdfTransactions(tempFilePath, pdfPassword);
      } catch (pdfError) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        // Pass through the friendly error messages from pdf parser
        return res.status(400).json({
          success: false,
          message: pdfError.message,
        });
      }
    } else {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(400).json({
        success: false,
        message: "Unsupported file type. Only CSV or PDF allowed.",
      });
    }

    if (!parsedTransactions.length) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
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

    // Clean up temp file after successful processing
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return res.status(201).json({
      success: true,
      message: "Manual import completed successfully.",
      inserted: result.length,
      ignoredDuplicates: parsedTransactions.length - result.length,
      totalProcessed: parsedTransactions.length,
      fileType: ext,
      requiresPassword: ext === 'pdf',
    });

  } catch (error) {
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    if (error.writeErrors) {
      return res.status(207).json({
        success: true,
        message: "Some transactions failed due to duplicates.",
        inserted: error.insertedDocs?.length || 0,
        duplicates: error.writeErrors.length,
        fileType: req.file?.originalname.split(".").pop().toLowerCase(),
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