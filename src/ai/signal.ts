import { Logger } from '../core/logger';
import axios from 'axios';
import { getSolscanWhaleIndex } from "./solscanWhaleIndex";

export interface TradingSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-1
  token: string;
  price?: number;
  amount?: number;
  reason: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface MarketData {
  price: number;
  volume24h: number;
  marketCap?: number;
  change24h?: number;
  timestamp: Date;
}

export interface TechnicalIndicators {
  rsi?: number;
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bollingerBands?: {
    upper: number;
    middle: number;
    lower: number;
  };
  movingAverages?: {
    sma20: number;
    sma50: number;
    ema12: number;
    ema26: number;
  };
}

export class SignalGenerator {
  private logger: Logger;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  constructor() {
    this.logger = new Logger('SignalGenerator');
  }

  async generateSignal(
    token: string,
    currentPrice: number,
    volume24h: number,
    marketData?: MarketData
  ): Promise<TradingSignal> {
    try {
      this.logger.debug(`Generating signal for ${token} at price ${currentPrice}`);

      // Update price history
      this.updatePriceHistory(token, currentPrice);
      this.updateVolumeHistory(token, volume24h);

      // Get technical indicators
      const indicators = this.calculateTechnicalIndicators(token);
      
      // Get Solscan Whale Index
      const whaleIndex = await getSolscanWhaleIndex(token);

      // Generate signal based on multiple factors
      const signal = await this.analyzeMarketConditions(
        token,
        currentPrice,
        volume24h,
        indicators,
        marketData,
        whaleIndex
      );

      this.logger.signal(signal.action, {
        token,
        confidence: signal.confidence,
        reason: signal.reason,
        price: currentPrice,
      });

      return signal;
    } catch (error) {
      this.logger.error(`Failed to generate signal for ${token}:`, error);
      throw error;
    }
  }

  private updatePriceHistory(token: string, price: number): void {
    if (!this.priceHistory.has(token)) {
      this.priceHistory.set(token, []);
    }
    
    const history = this.priceHistory.get(token)!;
    history.push(price);
    
    // Keep only last 100 prices for analysis
    if (history.length > 100) {
      history.shift();
    }
  }

  private updateVolumeHistory(token: string, volume: number): void {
    if (!this.volumeHistory.has(token)) {
      this.volumeHistory.set(token, []);
    }
    
    const history = this.volumeHistory.get(token)!;
    history.push(volume);
    
    // Keep only last 50 volumes for analysis
    if (history.length > 50) {
      history.shift();
    }
  }

  private calculateTechnicalIndicators(token: string): TechnicalIndicators {
    const prices = this.priceHistory.get(token) || [];
    const volumes = this.volumeHistory.get(token) || [];

    if (prices.length < 20) {
      return {};
    }

    const indicators: TechnicalIndicators = {};

    // Calculate RSI
    indicators.rsi = this.calculateRSI(prices);

    // Calculate MACD
    indicators.macd = this.calculateMACD(prices);

    // Calculate Bollinger Bands
    indicators.bollingerBands = this.calculateBollingerBands(prices);

    // Calculate Moving Averages
    indicators.movingAverages = this.calculateMovingAverages(prices);

    return indicators;
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 0;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;

    // For simplicity, using a basic signal line calculation
    const signal = macd * 0.9; // Simplified signal line
    const histogram = macd - signal;

    return { macd, signal, histogram };
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  private calculateBollingerBands(prices: number[], period: number = 20): { upper: number; middle: number; lower: number } {
    if (prices.length < period) {
      const currentPrice = prices[prices.length - 1];
      return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
    }

    const recentPrices = prices.slice(-period);
    const sma = recentPrices.reduce((sum, price) => sum + price, 0) / period;
    
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + (2 * stdDev),
      middle: sma,
      lower: sma - (2 * stdDev),
    };
  }

  private calculateMovingAverages(prices: number[]): { sma20: number; sma50: number; ema12: number; ema26: number } {
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);

    return { sma20, sma50, ema12, ema26 };
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices.reduce((sum, price) => sum + price, 0) / prices.length;
    }

    const recentPrices = prices.slice(-period);
    return recentPrices.reduce((sum, price) => sum + price, 0) / period;
  }

  private async analyzeMarketConditions(
    token: string,
    currentPrice: number,
    volume24h: number,
    indicators: TechnicalIndicators,
    marketData?: MarketData,
    whaleIndex?: number
  ): Promise<TradingSignal> {
    let buyScore = 0;
    let sellScore = 0;
    let reasons: string[] = [];

    // RSI Analysis
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        buyScore += 0.3;
        reasons.push(`RSI oversold (${indicators.rsi.toFixed(2)})`);
      } else if (indicators.rsi > 70) {
        sellScore += 0.3;
        reasons.push(`RSI overbought (${indicators.rsi.toFixed(2)})`);
      }
    }

    // MACD Analysis
    if (indicators.macd) {
      if (indicators.macd.macd > indicators.macd.signal && indicators.macd.histogram > 0) {
        buyScore += 0.2;
        reasons.push('MACD bullish crossover');
      } else if (indicators.macd.macd < indicators.macd.signal && indicators.macd.histogram < 0) {
        sellScore += 0.2;
        reasons.push('MACD bearish crossover');
      }
    }

    // Bollinger Bands Analysis
    if (indicators.bollingerBands) {
      if (currentPrice <= indicators.bollingerBands.lower) {
        buyScore += 0.2;
        reasons.push('Price at lower Bollinger Band');
      } else if (currentPrice >= indicators.bollingerBands.upper) {
        sellScore += 0.2;
        reasons.push('Price at upper Bollinger Band');
      }
    }

    // Moving Average Analysis
    if (indicators.movingAverages) {
      const { sma20, sma50, ema12, ema26 } = indicators.movingAverages;
      if (currentPrice > sma20 && sma20 > sma50) {
        buyScore += 0.1;
        reasons.push('Price above moving averages');
      } else if (currentPrice < sma20 && sma20 < sma50) {
        sellScore += 0.1;
        reasons.push('Price below moving averages');
      }
      if (ema12 > ema26) {
        buyScore += 0.1;
        reasons.push('EMA 12 > EMA 26');
      } else if (ema12 < ema26) {
        sellScore += 0.1;
        reasons.push('EMA 12 < EMA 26');
      }
    }

    // Volume Analysis
    const avgVolume = this.calculateAverageVolume(token);
    if (volume24h > avgVolume * 1.5) {
      buyScore += 0.1;
      reasons.push('High volume detected');
    }

    // Whale Index Analysis
    let confidenceAdj = 0;
    if (typeof whaleIndex === 'number') {
      if (whaleIndex > 50) {
        confidenceAdj += 0.1;
        reasons.push(`WSI: whales detected! (${whaleIndex.toFixed(2)})`);
      } else {
        confidenceAdj -= 0.1;
        reasons.push(`WSI: weak whale support (${whaleIndex.toFixed(2)})`);
      }
    }

    // Determine action and confidence
    const totalScore = buyScore + sellScore;
    let action: 'BUY' | 'SELL' | 'HOLD';
    let confidence: number;

    if (buyScore > sellScore && buyScore > 0.3) {
      action = 'BUY';
      confidence = Math.min(buyScore + confidenceAdj, 0.9);
    } else if (sellScore > buyScore && sellScore > 0.3) {
      action = 'SELL';
      confidence = Math.min(sellScore + confidenceAdj, 0.9);
    } else {
      action = 'HOLD';
      confidence = 0.1 + confidenceAdj;
      reasons.push('No clear signal');
    }

    return {
      action,
      confidence,
      token,
      price: currentPrice,
      reason: reasons.join(', '),
      timestamp: new Date(),
      metadata: {
        buyScore,
        sellScore,
        indicators,
        volume24h,
        avgVolume,
        whaleIndex,
      },
    };
  }

  private calculateAverageVolume(token: string): number {
    const volumes = this.volumeHistory.get(token) || [];
    if (volumes.length === 0) return 0;
    
    return volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
  }

  // Method to get signal history for analysis
  getSignalHistory(token: string): TradingSignal[] {
    // This would typically be stored in a database
    // For now, return empty array
    return [];
  }

  // Method to validate signal quality
  validateSignal(signal: TradingSignal): boolean {
    return (
      signal.confidence >= 0.1 &&
      signal.confidence <= 1.0 &&
      ['BUY', 'SELL', 'HOLD'].includes(signal.action) &&
      signal.token.length > 0 &&
      signal.reason.length > 0
    );
  }
}
