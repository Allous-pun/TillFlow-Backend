import Transaction from "../models/Transaction.js";
import { parseCsvTransactions } from "../utils/manualCsvParser.js";
import { parsePdfTransactions } from "../utils/manualPdfParser.js";
import fs from "fs";

/**
 * Handles parsing and storing manual uploads (CSV / PDF)
 */
export const processManualUpload = async (filePath, merchantId, businessShortCode, pdfPassword = null) => {
  let parsedData = [];
  let tempFilePath = filePath;

  try {
    if (filePath.endsWith(".csv")) {
      parsedData = await parseCsvTransactions(filePath);
    } else if (filePath.endsWith(".pdf")) {
      // For PDF files, password is required
      if (!pdfPassword) {
        throw new Error("PDF password is required. Please enter the 6-digit code from your SMS.");
      }

      // Validate password format
      if (!/^\d{6}$/.test(pdfPassword)) {
        throw new Error("Invalid password format. Please enter exactly 6 digits.");
      }

      parsedData = await parsePdfTransactions(filePath, pdfPassword);
    } else {
      throw new Error("Unsupported file format. Only CSV or PDF allowed.");
    }

    if (!parsedData.length) {
      throw new Error("No valid transactions found in the uploaded file.");
    }

    // Convert to db save format
    const transactionsToSave = parsedData.map((txn) => ({
      mpesaTransactionId: txn.id,
      merchant: merchantId,
      businessShortCode,
      amount: txn.amount,
      transactionType: txn.type,
      customer: {
        phoneNumber: txn.phoneNumber,
        name: extractName(txn.name)
      },
      transactionTime: txn.date,
      billRefNumber: txn.reference,
      rawMpesaResponse: txn.raw,
      source: filePath.endsWith(".csv") ? "manual-csv" : "manual-pdf"
    }));

    // Avoid duplicate inserts (unique index on mpesaTransactionId)
    const saved = [];

    for (const txn of transactionsToSave) {
      const exists = await Transaction.findOne({
        mpesaTransactionId: txn.mpesaTransactionId,
        merchant: merchantId
      });

      if (!exists) {
        const newTxn = await Transaction.create(txn);
        saved.push(newTxn);
      }
    }

    return {
      totalUploaded: parsedData.length,
      successfullySaved: saved.length,
      skippedDuplicates: parsedData.length - saved.length,
      requiresPassword: filePath.endsWith(".pdf"),
    };

  } catch (error) {
    // Re-throw with friendly messages for PDF password errors
    if (error.message.includes('password') || error.message.includes('Wrong password')) {
      throw new Error("Wrong password. Please check the 6-digit code from your SMS and try again.");
    }
    throw error;
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
};

// Ensures name formatting like "John Doe"
function extractName(rawName) {
  if (!rawName) return {};
  const parts = rawName
    .trim()
    .split(" ")
    .map((n) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());

  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts[1] : "",
    lastName: parts[parts.length - 1],
  };
}