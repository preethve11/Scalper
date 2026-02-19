/**
 * Historical Data Fetcher - Retrieves trade data and builds OHLCV candles for backtesting.
 * 
 * Supports multiple data sources (Helius, SolanaFM) with fallback to synthetic data.
 * Parses swap events from Solana transactions to derive trade prices and sizes.
 */

import axios from 'axios';

/**
 * Individual trade record with timestamp, price, size, and side.
 */
export interface Trade {
  timestamp: number; // Unix timestamp in milliseconds
  price: number; // Price per token in USD
  size: number; // Trade size in tokens
  side: 'buy' | 'sell'; // Trade direction
  signature?: string; // Transaction signature for debugging
}

/**
 * OHLCV candle data for a specific time interval.
 */
export interface OHLCV {
  timestamp: number; // Start of interval (Unix timestamp in milliseconds)
  open: number; // Opening price
  high: number; // Highest price in interval
  low: number; // Lowest price in interval
  close: number; // Closing price
  volume: number; // Total volume in tokens
  tradeCount: number; // Number of trades in this interval
}

/**
 * Configuration for data sources and parameters.
 */
interface DataSourceConfig {
  helius: {
    url: string;
    apiKey?: string;
    enabled: boolean;
  };
  solanafm: {
    url: string;
    apiKey?: string;
    enabled: boolean;
  };
  fallback: {
    initialPrice: number;
    volatility: number;
    seed: number;
  };
}

// Configuration from environment variables
const CONFIG: DataSourceConfig = {
  helius: {
    url: process.env.HELIUS_URL || 'https://mainnet.helius-rpc.com',
    apiKey: process.env.HELIUS_API_KEY,
    enabled: !!(process.env.HELIUS_URL && process.env.HELIUS_API_KEY)
  },
  solanafm: {
    url: process.env.SOLANAFM_URL || 'https://api.solanafm.com',
    apiKey: process.env.SOLANAFM_API_KEY,
    enabled: !!(process.env.SOLANAFM_URL && process.env.SOLANAFM_API_KEY)
  },
  fallback: {
    initialPrice: parseFloat(process.env.FALLBACK_INITIAL_PRICE || '1.0'),
    volatility: parseFloat(process.env.FALLBACK_VOLATILITY || '0.05'),
    seed: parseInt(process.env.FALLBACK_SEED || '12345')
  }
};

/**
 * Fetch raw trade data for a token between two dates.
 * 
 * @param tokenMint - The token mint address
 * @param fromISO - Start date in ISO format (e.g., '2024-01-01T00:00:00Z')
 * @param toISO - End date in ISO format (e.g., '2024-01-02T00:00:00Z')
 * @returns Array of trade records
 */
export async function fetchRawTrades(
  tokenMint: string, 
  fromISO: string, 
  toISO: string
): Promise<Trade[]> {
  const fromTimestamp = new Date(fromISO).getTime();
  const toTimestamp = new Date(toISO).getTime();

  if (isNaN(fromTimestamp) || isNaN(toTimestamp) || fromTimestamp >= toTimestamp) {
    throw new Error('Invalid date range provided');
  }

  try {
    // Try Helius first if available
    if (CONFIG.helius.enabled) {
      try {
        return await fetchTradesFromHelius(tokenMint, fromTimestamp, toTimestamp);
      } catch (error) {
        console.warn('Helius fetch failed, trying SolanaFM:', error);
      }
    }

    // Try SolanaFM if available
    if (CONFIG.solanafm.enabled) {
      try {
        return await fetchTradesFromSolanaFM(tokenMint, fromTimestamp, toTimestamp);
      } catch (error) {
        console.warn('SolanaFM fetch failed:', error);
      }
    }

    // Fallback to synthetic data
    console.warn('No data sources available, generating synthetic trade data');
    return generateSyntheticTrades(fromTimestamp, toTimestamp);

  } catch (error) {
    console.error('Failed to fetch trade data:', error);
    // Return synthetic data as last resort
    return generateSyntheticTrades(fromTimestamp, toTimestamp);
  }
}

/**
 * Fetch trades from Helius API by analyzing swap transactions.
 */
async function fetchTradesFromHelius(
  tokenMint: string, 
  fromTimestamp: number, 
  toTimestamp: number
): Promise<Trade[]> {
  const trades: Trade[] = [];
  const fromBlockTime = Math.floor(fromTimestamp / 1000);
  const toBlockTime = Math.floor(toTimestamp / 1000);

  try {
    // Get signatures for the token mint in the time range
    const response = await axios.post(`${CONFIG.helius.url}/?api-key=${CONFIG.helius.apiKey}`, {
      jsonrpc: '2.0',
      id: 'history-fetcher',
      method: 'getSignaturesForAddress',
      params: [
        tokenMint,
        {
          limit: 1000, // Adjust based on API limits
          before: undefined
        }
      ]
    }, {
      timeout: 30000
    });

    const signatures = response.data?.result || [];
    
    // Process transactions in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      const batchPromises = batch.map(async (sig: any) => {
        try {
          const txResponse = await axios.post(`${CONFIG.helius.url}/?api-key=${CONFIG.helius.apiKey}`, {
            jsonrpc: '2.0',
            id: 'tx-details',
            method: 'getTransaction',
            params: [
              sig.signature,
              {
                encoding: 'json',
                maxSupportedTransactionVersion: 0
              }
            ]
          }, {
            timeout: 10000
          });

          return parseSwapFromTransaction(txResponse.data?.result, tokenMint);
        } catch (error) {
          console.warn(`Failed to fetch transaction ${sig.signature}:`, error);
          return null;
        }
      });

      const batchTrades = (await Promise.all(batchPromises))
        .filter((t): t is Trade => t !== null)
        .filter(t => t.timestamp >= fromTimestamp && t.timestamp <= toTimestamp);

      trades.push(...batchTrades);
    }

    return trades.sort((a, b) => a.timestamp - b.timestamp);

  } catch (error) {
    console.error('Helius API error:', error);
    throw error;
  }
}

/**
 * Fetch trades from SolanaFM API.
 */
async function fetchTradesFromSolanaFM(
  tokenMint: string, 
  fromTimestamp: number, 
  toTimestamp: number
): Promise<Trade[]> {
  try {
    const response = await axios.get(`${CONFIG.solanafm.url}/v1/tokens/${tokenMint}/trades`, {
      params: {
        from: fromTimestamp,
        to: toTimestamp,
        limit: 1000
      },
      headers: {
        'Authorization': CONFIG.solanafm.apiKey ? `Bearer ${CONFIG.solanafm.apiKey}` : undefined
      },
      timeout: 30000
    });

    const trades = response.data?.trades || [];
    
    return trades.map((trade: any) => ({
      timestamp: new Date(trade.timestamp).getTime(),
      price: parseFloat(trade.price),
      size: parseFloat(trade.size),
      side: trade.side === 'buy' ? 'buy' : 'sell',
      signature: trade.signature
    })).sort((a: Trade, b: Trade) => a.timestamp - b.timestamp);

  } catch (error) {
    console.error('SolanaFM API error:', error);
    throw error;
  }
}

/**
 * Parse swap transaction to extract trade data.
 * This is a simplified parser - in production, use proper DEX program parsers.
 */
function parseSwapFromTransaction(tx: any, tokenMint: string): Trade | null {
  if (!tx?.meta?.innerInstructions) return null;

  try {
    // Look for Jupiter, Raydium, or other DEX swap instructions
    for (const innerInstruction of tx.meta.innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        // Check for Jupiter swap
        if (instruction.program === 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB') {
          return parseJupiterSwap(instruction, tx, tokenMint);
        }
        // Check for Raydium swap
        if (instruction.program === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
          return parseRaydiumSwap(instruction, tx, tokenMint);
        }
      }
    }
    return null;
  } catch (error) {
    console.warn('Failed to parse swap transaction:', error);
    return null;
  }
}

/**
 * Parse Jupiter swap instruction (simplified).
 */
function parseJupiterSwap(instruction: any, tx: any, tokenMint: string): Trade | null {
  try {
    // This is a placeholder - Jupiter swap parsing is complex
    // In production, use Jupiter's SDK or proper instruction decoder
    const parsed = instruction.parsed;
    if (parsed?.info?.sourceMint === tokenMint || parsed?.info?.destinationMint === tokenMint) {
      const amount = parseFloat(parsed.info.amount) || 0;
      const price = parseFloat(parsed.info.price) || 1; // Would need proper price calculation
      
      return {
        timestamp: tx.blockTime * 1000,
        price,
        size: amount,
        side: parsed.info.sourceMint === tokenMint ? 'sell' : 'buy',
        signature: tx.transaction.signatures[0]
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse Raydium swap instruction (simplified).
 */
function parseRaydiumSwap(instruction: any, tx: any, tokenMint: string): Trade | null {
  try {
    // This is a placeholder - Raydium swap parsing is complex
    // In production, use Raydium's SDK or proper instruction decoder
    const parsed = instruction.parsed;
    if (parsed?.info?.sourceMint === tokenMint || parsed?.info?.destinationMint === tokenMint) {
      const amount = parseFloat(parsed.info.amount) || 0;
      const price = parseFloat(parsed.info.price) || 1; // Would need proper price calculation
      
      return {
        timestamp: tx.blockTime * 1000,
        price,
        size: amount,
        side: parsed.info.sourceMint === tokenMint ? 'sell' : 'buy',
        signature: tx.transaction.signatures[0]
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate synthetic trade data using random walk (FALLBACK ONLY).
 * Clearly marked as synthetic data for testing purposes.
 */
function generateSyntheticTrades(fromTimestamp: number, toTimestamp: number): Trade[] {
  console.warn('⚠️  USING SYNTHETIC DATA - NOT REAL MARKET DATA');
  
  const trades: Trade[] = [];
  const duration = toTimestamp - fromTimestamp;
  const tradeInterval = Math.max(60000, duration / 100); // At least 1 trade per minute, max 100 trades
  
  let currentPrice = CONFIG.fallback.initialPrice;
  let seed = CONFIG.fallback.seed;
  
  // Simple linear congruential generator for deterministic randomness
  const lcg = (a: number, c: number, m: number) => (x: number) => (a * x + c) % m;
  const random = lcg(1664525, 1013904223, Math.pow(2, 32));
  
  for (let timestamp = fromTimestamp; timestamp < toTimestamp; timestamp += tradeInterval) {
    // Generate random price movement
    const randomValue = random(seed) / Math.pow(2, 32);
    const change = (randomValue - 0.5) * CONFIG.fallback.volatility;
    currentPrice = Math.max(0.001, currentPrice * (1 + change));
    
    // Generate random trade size
    const size = Math.random() * 1000 + 100; // 100-1100 tokens
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    
    trades.push({
      timestamp,
      price: currentPrice,
      size,
      side,
      signature: `synthetic_${timestamp}`
    });
    
    seed = random(seed);
  }
  
  return trades;
}

/**
 * Build OHLCV candles from trade data.
 * 
 * @param trades - Array of trade records
 * @param intervalMins - Candle interval in minutes
 * @returns Array of OHLCV candles
 */
export function buildOHLCV(trades: Trade[], intervalMins: number): OHLCV[] {
  if (trades.length === 0) return [];
  
  const intervalMs = intervalMins * 60 * 1000;
  const candles: OHLCV[] = [];
  
  // Group trades by time intervals
  const tradeGroups = new Map<number, Trade[]>();
  
  for (const trade of trades) {
    const intervalStart = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    if (!tradeGroups.has(intervalStart)) {
      tradeGroups.set(intervalStart, []);
    }
    tradeGroups.get(intervalStart)!.push(trade);
  }
  
  // Build OHLCV for each interval
  for (const [intervalStart, intervalTrades] of tradeGroups) {
    if (intervalTrades.length === 0) continue;
    
    // Sort trades by timestamp within the interval
    intervalTrades.sort((a, b) => a.timestamp - b.timestamp);
    
    const prices = intervalTrades.map(t => t.price);
    const volumes = intervalTrades.map(t => t.size);
    
    const candle: OHLCV = {
      timestamp: intervalStart,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: volumes.reduce((sum, vol) => sum + vol, 0),
      tradeCount: intervalTrades.length
    };
    
    candles.push(candle);
  }
  
  // Sort candles by timestamp
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get configuration for debugging/monitoring.
 */
export function getHistoryFetcherConfig() {
  return {
    helius: {
      enabled: CONFIG.helius.enabled,
      url: CONFIG.helius.url,
      hasApiKey: !!CONFIG.helius.apiKey
    },
    solanafm: {
      enabled: CONFIG.solanafm.enabled,
      url: CONFIG.solanafm.url,
      hasApiKey: !!CONFIG.solanafm.apiKey
    },
    fallback: CONFIG.fallback
  };
}

export default { fetchRawTrades, buildOHLCV };
