// src/data/priceFeed.ts
import { fetchSpotPrice, fetchFuturesPrice, fetchKlines } from "./binanceProvider";

export async function getHistoricalData(symbol: string, startDate: string, endDate: string) {
  console.log(`📈 Fetching historical data for ${symbol} from Binance...`);
  try {
    const candles = await fetchKlines(symbol, "1h", 1000);
    return candles;
  } catch (err) {
    console.error("❌ Failed to fetch from Binance:", err);
    return [];
  }
}

export async function getLivePrice(symbol: string) {
  try {
    return await fetchSpotPrice(symbol);
  } catch (err) {
    console.error("❌ Failed to fetch spot price:", err);
    return 0;
  }
}
