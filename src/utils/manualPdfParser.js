import fs from "fs";

/**
 * Parses PDF M-Pesa statements into structured transaction objects
 */
export const parsePdfTransactions = async (filePath) => {
  // Use dynamic import for CommonJS package
  const pdfParseModule = await import('pdf-parse');
  const pdfParse = pdfParseModule.default;
  
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);

  const text = pdfData.text;

  return extractTransactions(text);
};

/**
 * Regex extraction of M-Pesa lines:
 * Example PDF statement text:
 *   "QFC12345Y 12/02/2025 14:22 Buy Goods Ksh 500.00 0712345678 REF:12345 John Doe"
 */
function extractTransactions(text) {
  const results = [];

  // Regex with flexibility (capturing: ID, date, time, amount, phone, reference, name)
  const regex =
    /([A-Z0-9]{8,12})\s+([\d/]{8,10})\s+([\d:]{4,8})\s+([\w ]+?)\s+Ksh\s*([\d,]+\.\d{2})\s+(254\d{9}|0\d{9})\s+(?:REF[:\s]+(\S+))?\s*(.*)/gi;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const [
      ,
      id,
      date,
      time,
      type,
      amount,
      phone,
      reference,
      name,
    ] = match;

    results.push({
      id: id.trim(),
      amount: parseFloat(amount.replace(/,/g, "")),
      phoneNumber: normalizePhone(phone),
      date: new Date(`${date} ${time}`),
      type: inferTransactionType(type),
      reference: reference || null,
      name: name?.trim(),
      raw: match[0]
    });
  }

  return results;
}

/** Convert to 254 format */
function normalizePhone(phone) {
  phone = phone.replace(/\D/g, "");
  if (phone.startsWith("0")) return "254" + phone.slice(1);
  return phone;
}

/** Convert to schema enum */
function inferTransactionType(type = "") {
  type = type.toLowerCase();
  if (type.includes("buy")) return "Buy Goods";
  if (type.includes("paybill") || type.includes("pay bill")) return "Pay Bill";
  if (type.includes("send")) return "Send Money";
  if (type.includes("withdraw")) return "Withdraw";
  return "Buy Goods";
}