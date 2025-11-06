import Transaction from "../models/Transaction.js";
import { parseCsvTransactions } from "../utils/manualCsvParser.js";
import { parsePdfTransactions } from "../utils/manualPdfParser.js";

/**
 * Handles parsing and storing manual uploads (CSV / PDF)
 */
export const processManualUpload = async (filePath, merchantId, businessShortCode) => {
  let parsedData = [];

  if (filePath.endsWith(".csv")) {
    parsedData = await parseCsvTransactions(filePath);
  } else if (filePath.endsWith(".pdf")) {
    parsedData = await parsePdfTransactions(filePath);
  } else {
    throw new Error("Unsupported file format.");
  }

  if (!parsedData.length) {
    throw new Error("No valid transactions found.");
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
  };
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
