import axios from "axios";
import { Logger } from "../core/logger";

const logger = new Logger("Solscan");

const SOLSCAN_API = process.env.SOLSCAN_API || "https://api.solscan.io";

export async function getRecentTransactions(wallet: string) {
  try {
    const url = `${SOLSCAN_API}/account/transaction?account=${wallet}&limit=5`;
    const res = await axios.get(url);
    return res.data;
  } catch (e: any) {
    logger.error(`Failed to fetch tx for ${wallet}: ${String(e)}`);
    return [];
  }
}

