/**
 * On-chain Analyzer - Detects whale activity, LP events, and holder concentration.
 * 
 * Uses Helius API to analyze recent transfers and token holder distribution.
 * 
 * TODO: Replace Helius endpoints with your preferred on-chain indexer:
 * - SolanaFM API
 * - Solscan API  
 * - Custom RPC + program log parsing
 * - Jupiter API for LP detection
 */

import axios from 'axios';

export interface OnchainAnalysis {
  whaleScore: number; // [0, 1] - higher means more whale activity
  lpFlag: boolean; // true if LP activity detected or concentrated holding
  holderConcentration: number; // [0, 1] - higher means more concentrated
}

export interface TransferData {
  amount: number;
  usdValue: number;
  from: string;
  to: string;
  blockTime: number;
  signature: string;
}

export interface TokenHolder {
  address: string;
  amount: number;
  percentage: number;
}

// Configuration from environment
const HELIUS_CONFIG = {
  url: process.env.HELIUS_URL || 'https://mainnet.helius-rpc.com',
  apiKey: process.env.HELIUS_API_KEY,
  enabled: !!(process.env.HELIUS_API_KEY && process.env.HELIUS_URL)
};

// Analysis parameters (configurable via env)
const ANALYSIS_CONFIG = {
  maxTransfers: parseInt(process.env.ONCHAIN_MAX_TRANSFERS || '100'),
  lookbackHours: parseInt(process.env.ONCHAIN_LOOKBACK_HOURS || '24'),
  whaleThresholdPercent: parseFloat(process.env.ONCHAIN_WHALE_THRESHOLD || '5.0'), // % of supply
  lpThresholdPercent: parseFloat(process.env.ONCHAIN_LP_THRESHOLD || '10.0'), // % of supply for LP detection
  topHoldersCount: parseInt(process.env.ONCHAIN_TOP_HOLDERS || '5')
};

/**
 * Main on-chain analysis function.
 * 
 * @param tokenMint - The token mint address to analyze
 * @returns Analysis results with whale score, LP flag, and holder concentration
 */
export async function onchainAnalyzer(tokenMint: string): Promise<OnchainAnalysis> {
  if (!HELIUS_CONFIG.enabled) {
    console.warn('On-chain analyzer disabled: HELIUS_API_KEY or HELIUS_URL not configured');
    return {
      whaleScore: 0,
      lpFlag: false,
      holderConcentration: 0.1 // Conservative default
    };
  }

  try {
    // Fetch recent transfers and holder data in parallel
    const [transfers, holders] = await Promise.all([
      fetchRecentTransfers(tokenMint),
      fetchTokenHolders(tokenMint)
    ]);

    // Calculate whale score from transfer amounts
    const whaleScore = calculateWhaleScore(transfers);
    
    // Detect LP activity and concentrated holdings
    const lpFlag = detectLpActivity(transfers, holders);
    
    // Calculate holder concentration using top holders
    const holderConcentration = calculateHolderConcentration(holders);

    return {
      whaleScore,
      lpFlag,
      holderConcentration
    };

  } catch (error) {
    console.error(`On-chain analysis failed for ${tokenMint}:`, error);
    // Return conservative defaults on error
    return {
      whaleScore: 0,
      lpFlag: false,
      holderConcentration: 0.1
    };
  }
}

/**
 * Fetch recent transfers for the token mint from Helius API.
 */
async function fetchRecentTransfers(tokenMint: string): Promise<TransferData[]> {
  const lookbackTime = Math.floor(Date.now() / 1000) - (ANALYSIS_CONFIG.lookbackHours * 3600);
  
  try {
    const response = await axios.post(`${HELIUS_CONFIG.url}/?api-key=${HELIUS_CONFIG.apiKey}`, {
      jsonrpc: '2.0',
      id: 'onchain-analyzer',
      method: 'getSignaturesForAddress',
      params: [
        tokenMint,
        {
          limit: ANALYSIS_CONFIG.maxTransfers,
          before: undefined // Get most recent
        }
      ]
    }, {
      timeout: 15000
    });

    const signatures = response.data?.result || [];
    
    // Get transaction details for each signature
    const transferPromises = signatures.slice(0, 20).map(async (sig: any) => {
      try {
        const txResponse = await axios.post(`${HELIUS_CONFIG.url}/?api-key=${HELIUS_CONFIG.apiKey}`, {
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
        });

        return parseTransferFromTransaction(txResponse.data?.result, tokenMint);
      } catch (error) {
        console.warn(`Failed to fetch transaction ${sig.signature}:`, error);
        return null;
      }
    });

    const transfers = (await Promise.all(transferPromises))
      .filter((t): t is TransferData => t !== null)
      .filter(t => t.blockTime >= lookbackTime);

    return transfers;

  } catch (error) {
    console.error('Failed to fetch transfers:', error);
    return [];
  }
}

/**
 * Parse transfer data from Solana transaction.
 * This is a simplified parser - in production, use a proper SPL token program parser.
 */
function parseTransferFromTransaction(tx: any, tokenMint: string): TransferData | null {
  if (!tx?.meta?.innerInstructions) return null;

  try {
    // Look for SPL token transfers in inner instructions
    for (const innerInstruction of tx.meta.innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        if (instruction.program === 'spl-token' && instruction.parsed?.type === 'transfer') {
          const parsed = instruction.parsed;
          if (parsed.info.mint === tokenMint) {
            const amount = parseInt(parsed.info.amount);
            const decimals = 9; // Most SPL tokens use 9 decimals - should be fetched from token metadata
            const usdValue = 0; // Would need price data to calculate USD value
            
            return {
              amount: amount / Math.pow(10, decimals),
              usdValue,
              from: parsed.info.source,
              to: parsed.info.destination,
              blockTime: tx.blockTime,
              signature: tx.transaction.signatures[0]
            };
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.warn('Failed to parse transfer:', error);
    return null;
  }
}

/**
 * Fetch token holder distribution from Helius API.
 */
async function fetchTokenHolders(tokenMint: string): Promise<TokenHolder[]> {
  try {
    // Use getTokenAccounts to find all token accounts for this mint
    const response = await axios.post(`${HELIUS_CONFIG.url}/?api-key=${HELIUS_CONFIG.apiKey}`, {
      jsonrpc: '2.0',
      id: 'token-holders',
      method: 'getTokenAccountsByMint',
      params: [tokenMint]
    }, {
      timeout: 15000
    });

    const accounts = response.data?.result?.value || [];
    
    // Parse account data to get holder amounts
    const holders: TokenHolder[] = accounts.map((account: any) => {
      const amount = parseInt(account.account.data.parsed.info.tokenAmount.amount);
      const decimals = account.account.data.parsed.info.tokenAmount.decimals;
      const uiAmount = amount / Math.pow(10, decimals);
      
      return {
        address: account.pubkey,
        amount: uiAmount,
        percentage: 0 // Will be calculated after we have total supply
      };
    });

    // Calculate percentages
    const totalSupply = holders.reduce((sum, holder) => sum + holder.amount, 0);
    if (totalSupply > 0) {
      holders.forEach(holder => {
        holder.percentage = (holder.amount / totalSupply) * 100;
      });
    }

    // Sort by amount descending
    return holders.sort((a, b) => b.amount - a.amount);

  } catch (error) {
    console.error('Failed to fetch token holders:', error);
    return [];
  }
}

/**
 * Calculate whale score based on transfer amounts.
 * Higher score means more whale activity (large transfers relative to total volume).
 */
function calculateWhaleScore(transfers: TransferData[]): number {
  if (transfers.length === 0) return 0;

  // Sort transfers by amount descending
  const sortedTransfers = transfers.sort((a, b) => b.amount - a.amount);
  
  // Calculate total volume
  const totalVolume = transfers.reduce((sum, t) => sum + t.amount, 0);
  
  if (totalVolume === 0) return 0;

  // Get the largest transfer
  const topTransfer = sortedTransfers[0];
  const topTransferRatio = topTransfer.amount / totalVolume;

  // Map to 0-1 scale with some smoothing
  const whaleScore = Math.min(1, Math.max(0, topTransferRatio * 2)); // Scale factor of 2 for sensitivity
  
  return whaleScore;
}

/**
 * Detect LP activity and concentrated holdings.
 * Returns true if LP tokens moved recently or if single holder has > threshold.
 */
function detectLpActivity(transfers: TransferData[], holders: TokenHolder[]): boolean {
  // Check for concentrated holdings
  if (holders.length > 0) {
    const topHolder = holders[0];
    if (topHolder.percentage > ANALYSIS_CONFIG.lpThresholdPercent) {
      return true;
    }
  }

  // Check for recent large transfers (potential LP activity)
  const recentLargeTransfers = transfers.filter(t => 
    t.amount > 0 && // Has some amount
    Date.now() / 1000 - t.blockTime < 3600 // Within last hour
  );

  // If we see multiple large transfers recently, might be LP activity
  return recentLargeTransfers.length >= 3;

  // TODO: Add specific LP token detection by checking for known LP token mints
  // or by analyzing program logs for DEX interactions
}

/**
 * Calculate holder concentration using a simplified Gini-like measure.
 * Returns concentration of top N holders as a 0-1 score.
 */
function calculateHolderConcentration(holders: TokenHolder[]): number {
  if (holders.length === 0) return 0;

  // Get top N holders
  const topHolders = holders.slice(0, ANALYSIS_CONFIG.topHoldersCount);
  
  // Calculate their combined percentage
  const topHoldersPercentage = topHolders.reduce((sum, holder) => sum + holder.percentage, 0);
  
  // Map to 0-1 scale (100% = 1.0, 0% = 0.0)
  return Math.min(1, topHoldersPercentage / 100);
}

/**
 * Get analysis configuration for debugging/monitoring.
 */
export function getAnalysisConfig() {
  return {
    helius: {
      enabled: HELIUS_CONFIG.enabled,
      url: HELIUS_CONFIG.url,
      hasApiKey: !!HELIUS_CONFIG.apiKey
    },
    analysis: ANALYSIS_CONFIG
  };
}

export default onchainAnalyzer;
