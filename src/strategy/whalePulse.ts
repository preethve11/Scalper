import { Logger } from "../core/logger";

const logger = new Logger("WhalePulse");

export function analyzeWhaleActivity(transactions: any[]): "BUY" | "SELL" | "HOLD" {
  if (transactions.length === 0) return "HOLD";

  // Placeholder logic - adapt based on your transaction structure
  const buys = transactions.filter((tx: any) => tx.action === "buy" || tx.type === "buy").length;
  const sells = transactions.filter((tx: any) => tx.action === "sell" || tx.type === "sell").length;

  const sentiment = buys > sells ? "BUY" : sells > buys ? "SELL" : "HOLD";
  logger.info(`📊 Whale Sentiment: ${sentiment}`);
  return sentiment;
}

