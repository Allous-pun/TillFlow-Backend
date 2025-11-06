import fs from "fs";
import csv from "csv-parser";

/**
 * Parses manual CSV uploads into structured M-Pesa transaction objects
 * CSV Expected Columns (case-insensitive):
 *  "Receipt No", "Completion Time", "Amount", "Balance", "MSISDN", "Name", "Type", "Reference"
 */
export const parseCsvTransactions = async (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const txn = normalizeCsvRow(row);
          if (txn) results.push(txn);
        } catch (err) {
          console.warn("Skipping invalid CSV row →", row);
        }
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
};

/**
 * Convert raw CSV row → uniform transaction object
 */
function normalizeCsvRow(row) {
  const receipt = row["Receipt No"] || row["ReceiptNumber"] || row["M-PESA Receipt"] || row["Transaction ID"];

  if (!receipt) return null;

  const amount = parseFloat(row["Amount"]?.replace(/[,]/g, "") ?? 0);
  const phone = normalizePhone(row["MSISDN"] || row["Phone"] || "");
  const date = parseCsvDate(row["Completion Time"]);
  const type = inferTransactionType(row["Type"]);
  const reference = row["Reference"] || row["Account No"] || null;

  return {
    id: receipt.trim(),
    amount,
    phoneNumber: phone,
    date,
    type,
    reference,
    raw: row
  };
}

/** Converts CSV date (M-Pesa format) → JS Date */
function parseCsvDate(raw) {
  if (!raw) return new Date();
  return new Date(raw.replace(/-/g, "/"));
}

/** Normalizes phone numbers into 254 format */
function normalizePhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
  if (cleaned.startsWith("254")) return cleaned;
  return null;
}

/** Convert CSV type to schema enum */
function inferTransactionType(type) {
  const val = type?.toLowerCase();
  if (val.includes("buy goods") || val.includes("till")) return "Buy Goods";
  if (val.includes("paybill") || val.includes("pay bill")) return "Pay Bill";
  if (val.includes("send")) return "Send Money";
  if (val.includes("withdraw")) return "Withdraw";
  return "Buy Goods"; // fallback
}
