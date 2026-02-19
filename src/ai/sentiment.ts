/**
 * Social sentiment analysis for cryptocurrency tokens.
 * 
 * Aggregates sentiment from multiple sources (X/Twitter, Telegram, Helius logs)
 * and uses GrokClient for AI-powered sentiment analysis.
 */

import axios, { AxiosResponse } from 'axios';
import { GrokClient } from './grokClient';

// Cache entry with timestamp for TTL
interface CacheEntry {
  data: SentimentResult;
  timestamp: number;
}

interface SentimentResult {
  score: number;
  reason: string;
  sourceCount: number;
}

interface SocialPost {
  text: string;
  source: string;
  timestamp: number;
  weight: number; // For weighted averaging
}

// In-memory cache with 30-second TTL
const sentimentCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Grok API configuration
const GROK_CONFIG = {
  endpoint: process.env.GROK_ENDPOINT || 'https://api.grok.ai',
  apiKey: process.env.GROK_API_KEY,
  xBearerToken: process.env.X_BEARER_TOKEN, // For X/Twitter data access
  enabled: !!(process.env.GROK_API_KEY && process.env.X_BEARER_TOKEN)
};

/**
 * Get sentiment analysis for a cryptocurrency token.
 * 
 * @param tokenSymbol - The token symbol (e.g., 'SOL', 'BONK')
 * @param tokenMint - Optional token mint address for more precise searches
 * @returns Promise with sentiment score, reason, and source count
 */
export async function getSentimentForToken(
  tokenSymbol: string, 
  tokenMint?: string
): Promise<SentimentResult> {
  if (!tokenSymbol?.trim()) {
    return {
      score: 0,
      reason: 'No token symbol provided',
      sourceCount: 0
    };
  }

  const cacheKey = `${tokenSymbol.toLowerCase()}_${tokenMint || 'default'}`;
  
  // Check cache first
  const cached = sentimentCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // Check if Grok API is configured
    if (!GROK_CONFIG.enabled) {
      const result = {
        score: 0,
        reason: 'Grok API not configured (missing GROK_API_KEY or X_BEARER_TOKEN)',
        sourceCount: 0
      };
      sentimentCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // Fetch social posts using Grok API
    const socialPosts = await fetchSocialPostsFromGrok(tokenSymbol, tokenMint);
    
    if (socialPosts.length === 0) {
      const result = {
        score: 0,
        reason: 'No social data found for token',
        sourceCount: 0
      };
      sentimentCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    // Analyze sentiment using GrokClient
    const sentimentScores = await analyzeSentiments(socialPosts);
    
    // Compute weighted average
    const result = computeWeightedSentiment(sentimentScores, socialPosts);
    
    // Cache the result
    sentimentCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
    
  } catch (error) {
    console.error(`Sentiment analysis failed for ${tokenSymbol}:`, error);
    const result = {
      score: 0,
      reason: `Analysis failed: ${(error as Error).message}`,
      sourceCount: 0
    };
    sentimentCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }
}

/**
 * Fetch social posts using Grok API.
 */
async function fetchSocialPostsFromGrok(tokenSymbol: string, tokenMint?: string): Promise<SocialPost[]> {
  const searchTerms = [tokenSymbol];
  if (tokenMint) searchTerms.push(tokenMint);
  
  const query = searchTerms.join(' OR ');
  
  try {
    // Call Grok API to get social media posts
    const response = await axios.post(`${GROK_CONFIG.endpoint}/v1/social/search`, {
      query,
      platforms: ['twitter', 'telegram', 'reddit'], // Grok can search multiple platforms
      limit: 10,
      timeRange: '24h' // Last 24 hours
    }, {
      headers: {
        'Authorization': `Bearer ${GROK_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'X-Twitter-Bearer': GROK_CONFIG.xBearerToken // Pass X Bearer token for Twitter access
      },
      timeout: 15000
    });

    const posts = response.data?.posts || response.data?.data || [];
    
    return posts.map((post: any) => ({
      text: post.text || post.content || post.body || '',
      source: post.platform || post.source || 'Unknown',
      timestamp: new Date(post.timestamp || post.created_at || Date.now()).getTime(),
      weight: getSourceWeight(post.platform || post.source)
    }));
    
  } catch (error) {
    console.error('Grok API fetch failed:', error);
    throw new Error(`Failed to fetch social data: ${(error as Error).message}`);
  }
}

/**
 * Get weight for different social media platforms.
 */
function getSourceWeight(platform: string): number {
  const weights: Record<string, number> = {
    'twitter': 1.0,
    'x': 1.0,
    'telegram': 0.8,
    'reddit': 0.7,
    'discord': 0.6
  };
  return weights[platform?.toLowerCase()] || 0.5;
}


/**
 * Analyze sentiment for all social posts using GrokClient.
 */
async function analyzeSentiments(posts: SocialPost[]): Promise<Array<{score: number, rationale: string}>> {
  const grokClient = new GrokClient();
  const analyses = [];

  for (const post of posts) {
    try {
      const analysis = await grokClient.analyzeText(post.text);
      analyses.push({
        score: analysis.score,
        rationale: analysis.rationale
      });
    } catch (error) {
      console.warn(`Sentiment analysis failed for post: ${post.text.substring(0, 50)}...`);
      analyses.push({
        score: 0,
        rationale: 'Analysis failed'
      });
    }
  }

  return analyses;
}

/**
 * Compute weighted average sentiment score and combine rationales.
 */
function computeWeightedSentiment(
  analyses: Array<{score: number, rationale: string}>, 
  posts: SocialPost[]
): SentimentResult {
  if (analyses.length === 0) {
    return {
      score: 0,
      reason: 'No analyses available',
      sourceCount: 0
    };
  }

  // Calculate weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  const reasons: string[] = [];

  for (let i = 0; i < analyses.length; i++) {
    const analysis = analyses[i];
    const post = posts[i];
    const weight = post.weight;
    
    weightedSum += analysis.score * weight;
    totalWeight += weight;
    
    // Collect non-empty rationales
    if (analysis.rationale && analysis.rationale !== 'Analysis failed') {
      reasons.push(`${post.source}: ${analysis.rationale.substring(0, 100)}`);
    }
  }

  const averageScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  // Combine rationales (limit to 3 most relevant)
  const combinedReason = reasons
    .slice(0, 3)
    .join(' | ') || 'Sentiment analysis completed';

  return {
    score: Math.max(-1, Math.min(1, averageScore)), // Clamp to [-1, 1]
    reason: combinedReason,
    sourceCount: posts.length
  };
}

/**
 * Clear the sentiment cache (useful for testing or manual cache invalidation).
 */
export function clearSentimentCache(): void {
  sentimentCache.clear();
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: sentimentCache.size,
    keys: Array.from(sentimentCache.keys())
  };
}
