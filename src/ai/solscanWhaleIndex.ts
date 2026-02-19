import { Logger } from "../core/logger";
import { TOKEN_MINTS } from "../config/tokenMap";
import { Cache } from "../utils/cache";

/**
 * Fetch whale concentration for a given SPL token using Solscan public API.
 * Uses token holders list to estimate whale dominance.
 */
const cache = new Cache(24); // 24-hour TTL

export async function getSolscanWhaleIndex(tokenSymbol: string): Promise<number> {
  const logger = new Logger("SolscanWhales");
  try {
    // Auto-map symbol -> mint
    const tokenMint = TOKEN_MINTS[tokenSymbol.toUpperCase()] || tokenSymbol;
    const cacheKey = `solscan_${tokenMint}`;

    const cached = cache.get<number>(cacheKey);
    if (cached !== null) {
      logger.info(`🐋 Loaded cached Whale Index for ${tokenSymbol}: ${cached}`);
      return cached;
    }

    // Try multiple URL variants to handle Solscan API quirks
    const urlVariants = [
      `https://public-api.solscan.io/token/holders?tokenAddress=${tokenMint}&limit=50`,
      `https://public-api.solscan.io/token/holders?tokenAddress=${tokenMint}&offset=0&size=50`,
    ];

    let data: any[] | null = null;
    let lastStatus: number | undefined;

    for (const url of urlVariants) {
      const res = await fetch(url);
      lastStatus = res.status;
      if (!res.ok) {
        logger.warn(`Solscan holders fetch failed (${res.status}) for ${tokenSymbol} via ${url}`);
        continue;
      }
      const json = (await res.json()) as { data?: unknown } | unknown[];
      const j = json as { data?: unknown };
      const arr = Array.isArray(j.data) ? j.data : Array.isArray(json) ? json : null;
      if (arr && arr.length) {
        data = arr;
        break;
      }
    }

    if (!data || data.length === 0) {
      logger.warn(`No holder data for ${tokenSymbol} (last status: ${lastStatus ?? 'n/a'})`);
      cache.set(cacheKey, 0);
      return 0;
    }

    const totalBalance = data.reduce(
      (sum, h) => sum + Number(h.tokenAmount?.uiAmount ?? 0),
      0
    );
    const top10Balance = data
      .slice(0, 10)
      .reduce((sum, h) => sum + Number(h.tokenAmount?.uiAmount ?? 0), 0);

    const whaleShare = totalBalance > 0 ? (top10Balance / totalBalance) : 0;
    const wsi = Math.round(whaleShare * 100);

    cache.set(cacheKey, wsi);
    logger.info(`🐋 Solscan Whale Solidity Index for ${tokenSymbol}: ${wsi}`);
    return wsi;
  } catch (err) {
    logger.warn(`Solscan Whale fetch failed: ${err}`);
    // Cache zeros to avoid repeated errors within the TTL window
    try {
      const tokenMint = TOKEN_MINTS[tokenSymbol.toUpperCase()] || tokenSymbol;
      cache.set(`solscan_${tokenMint}`, 0);
    } catch {}
    return 0;
  }
}

export async function loadWSI(tokenSymbol: string): Promise<number> {
  return getSolscanWhaleIndex(tokenSymbol);
}
