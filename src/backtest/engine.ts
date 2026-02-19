import { Logger } from '../core/logger';
import { SignalGenerator, TradingSignal } from '../ai/signal';
import { JupiterDEX } from '../dex/jupiter';
import config from '../config/env';

export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  tokens: string[];
  slippageBps: number;
  maxPositions: number;
}

export interface Trade {
  id: string;
  token: string;
  action: 'BUY' | 'SELL';
  amount: number;
  price: number;
  timestamp: Date;
  balance: number;
  pnl?: number;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  finalBalance: number;
  trades: Trade[];
  dailyReturns: number[];
  equityCurve: number[];
}

export interface MarketDataPoint {
  timestamp: Date;
  token: string;
  price: number;
  volume: number;
  marketCap?: number;
}

export class BacktestEngine {
  private logger: Logger;
  private signalGenerator: SignalGenerator;
  private jupiterDEX: JupiterDEX;
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.logger = new Logger('BacktestEngine');
    this.signalGenerator = new SignalGenerator();
    this.jupiterDEX = new JupiterDEX();
    this.config = config;
  }

  async runBacktest(marketData: MarketDataPoint[]): Promise<BacktestResult> {
    this.logger.info(`Starting backtest from ${this.config.startDate} to ${this.config.endDate}`);
    this.logger.info(`Initial balance: ${this.config.initialBalance} SOL`);

    let balance = this.config.initialBalance;
    const trades: Trade[] = [];
    const positions: Map<string, { amount: number; avgPrice: number }> = new Map();
    const dailyReturns: number[] = [];
    const equityCurve: number[] = [balance];

    // Filter market data by date range
    const filteredData = marketData.filter(
      data => data.timestamp >= this.config.startDate && data.timestamp <= this.config.endDate
    );

    // Group data by day for daily returns calculation
    const dailyData = this.groupDataByDay(filteredData);

    for (const dataPoint of filteredData) {
      try {
        // Generate signal for this data point
        const signal = await this.signalGenerator.generateSignal(
          dataPoint.token,
          dataPoint.price,
          dataPoint.volume,
          {
            price: dataPoint.price,
            volume24h: dataPoint.volume,
            marketCap: dataPoint.marketCap,
            timestamp: dataPoint.timestamp,
          }
        );

        // Execute trade if signal is strong enough
        if (signal.confidence > 0.5 && signal.action !== 'HOLD') {
          const trade = await this.executeTrade(
            signal,
            balance,
            positions,
            dataPoint.timestamp
          );

          if (trade) {
            trades.push(trade);
            balance = trade.balance;
            equityCurve.push(balance);

            this.logger.trade(
              trade.action,
              trade.token,
              trade.amount,
              trade.price
            );
          }
        }

        // Calculate daily returns
        const dailyReturn = this.calculateDailyReturn(dailyData, dataPoint.timestamp, balance);
        if (dailyReturn !== null) {
          dailyReturns.push(dailyReturn);
        }

      } catch (error) {
        this.logger.error(`Error processing data point for ${dataPoint.token}:`, error);
      }
    }

    // Close all remaining positions
    const finalBalance = await this.closeAllPositions(positions, balance, trades);
    equityCurve.push(finalBalance);

    // Calculate final results
    const result = this.calculateResults(trades, this.config.initialBalance, finalBalance, dailyReturns, equityCurve);

    this.logger.info(`Backtest completed. Final balance: ${finalBalance.toFixed(4)} SOL`);
    this.logger.performance('Total Return', result.totalReturn * 100, '%');
    this.logger.performance('Win Rate', result.winRate * 100, '%');
    this.logger.performance('Sharpe Ratio', result.sharpeRatio);

    return result;
  }

  private async executeTrade(
    signal: TradingSignal,
    currentBalance: number,
    positions: Map<string, { amount: number; avgPrice: number }>,
    timestamp: Date
  ): Promise<Trade | null> {
    try {
      const { token, action, price, confidence } = signal;
      const tradeAmount = this.calculateTradeAmount(currentBalance, confidence);

      if (action === 'BUY') {
        return await this.executeBuy(token, tradeAmount, price!, currentBalance, positions, timestamp);
      } else if (action === 'SELL') {
        return await this.executeSell(token, tradeAmount, price!, currentBalance, positions, timestamp);
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to execute trade:`, error);
      return null;
    }
  }

  private async executeBuy(
    token: string,
    amount: number,
    price: number,
    currentBalance: number,
    positions: Map<string, { amount: number; avgPrice: number }>,
    timestamp: Date
  ): Promise<Trade | null> {
    const cost = amount * price;
    
    if (cost > currentBalance) {
      this.logger.warn(`Insufficient balance for buy order: ${cost} > ${currentBalance}`);
      return null;
    }

    const newBalance = currentBalance - cost;
    const tradeId = this.generateTradeId();

    // Update position
    const existingPosition = positions.get(token);
    if (existingPosition) {
      const totalAmount = existingPosition.amount + amount;
      const totalCost = (existingPosition.amount * existingPosition.avgPrice) + cost;
      positions.set(token, {
        amount: totalAmount,
        avgPrice: totalCost / totalAmount,
      });
    } else {
      positions.set(token, { amount, avgPrice: price });
    }

    return {
      id: tradeId,
      token,
      action: 'BUY',
      amount,
      price,
      timestamp,
      balance: newBalance,
    };
  }

  private async executeSell(
    token: string,
    amount: number,
    price: number,
    currentBalance: number,
    positions: Map<string, { amount: number; avgPrice: number }>,
    timestamp: Date
  ): Promise<Trade | null> {
    const position = positions.get(token);
    
    if (!position || position.amount < amount) {
      this.logger.warn(`Insufficient position for sell order: ${amount} > ${position?.amount || 0}`);
      return null;
    }

    const proceeds = amount * price;
    const newBalance = currentBalance + proceeds;
    const tradeId = this.generateTradeId();

    // Update position
    const newAmount = position.amount - amount;
    if (newAmount <= 0) {
      positions.delete(token);
    } else {
      positions.set(token, { ...position, amount: newAmount });
    }

    // Calculate PnL
    const pnl = (price - position.avgPrice) * amount;

    return {
      id: tradeId,
      token,
      action: 'SELL',
      amount,
      price,
      timestamp,
      balance: newBalance,
      pnl,
    };
  }

  private calculateTradeAmount(balance: number, confidence: number): number {
    // Risk management: use 10% of balance per trade, scaled by confidence
    const baseAmount = balance * 0.1;
    return baseAmount * confidence;
  }

  private async closeAllPositions(
    positions: Map<string, { amount: number; avgPrice: number }>,
    currentBalance: number,
    trades: Trade[]
  ): Promise<number> {
    let finalBalance = currentBalance;

    for (const [token, position] of positions) {
      // For backtesting, we'll assume we can sell at the average price
      // In reality, you'd need to get the current market price
      const sellPrice = position.avgPrice; // Simplified for backtesting
      const proceeds = position.amount * sellPrice;
      finalBalance += proceeds;

      // Add closing trade
      const closingTrade: Trade = {
        id: this.generateTradeId(),
        token,
        action: 'SELL',
        amount: position.amount,
        price: sellPrice,
        timestamp: new Date(),
        balance: finalBalance,
        pnl: (sellPrice - position.avgPrice) * position.amount,
      };

      trades.push(closingTrade);
    }

    return finalBalance;
  }

  private calculateResults(
    trades: Trade[],
    initialBalance: number,
    finalBalance: number,
    dailyReturns: number[],
    equityCurve: number[]
  ): BacktestResult {
    const totalTrades = trades.length;
    const buyTrades = trades.filter(t => t.action === 'BUY');
    const sellTrades = trades.filter(t => t.action === 'SELL' && t.pnl !== undefined);

    const totalPnL = sellTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const totalReturn = (finalBalance - initialBalance) / initialBalance;

    const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = sellTrades.filter(t => (t.pnl || 0) < 0);

    const winRate = sellTrades.length > 0 ? winningTrades.length / sellTrades.length : 0;
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length 
      : 0;

    const maxDrawdown = this.calculateMaxDrawdown(equityCurve);
    const sharpeRatio = this.calculateSharpeRatio(dailyReturns);

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalPnL,
      totalReturn,
      maxDrawdown,
      sharpeRatio,
      winRate,
      avgWin,
      avgLoss,
      finalBalance,
      trades,
      dailyReturns,
      equityCurve,
    };
  }

  private calculateMaxDrawdown(equityCurve: number[]): number {
    let maxDrawdown = 0;
    let peak = equityCurve[0];

    for (const value of equityCurve) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private calculateSharpeRatio(dailyReturns: number[]): number {
    if (dailyReturns.length === 0) return 0;

    const avgReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Assuming risk-free rate of 0 for simplicity
    return avgReturn / stdDev;
  }

  private groupDataByDay(data: MarketDataPoint[]): Map<string, MarketDataPoint[]> {
    const dailyData = new Map<string, MarketDataPoint[]>();

    for (const point of data) {
      const dayKey = point.timestamp.toISOString().split('T')[0];
      if (!dailyData.has(dayKey)) {
        dailyData.set(dayKey, []);
      }
      dailyData.get(dayKey)!.push(point);
    }

    return dailyData;
  }

  private calculateDailyReturn(
    dailyData: Map<string, MarketDataPoint[]>,
    timestamp: Date,
    currentBalance: number
  ): number | null {
    // Simplified daily return calculation
    // In reality, you'd track the balance at the start and end of each day
    return null; // Placeholder
  }

  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Method to export results to CSV
  exportResultsToCSV(result: BacktestResult, filename: string): void {
    // Implementation would write trades to CSV file
    this.logger.info(`Results exported to ${filename}`);
  }

  // Method to generate performance report
  generatePerformanceReport(result: BacktestResult): string {
    return `
Backtest Performance Report
==========================
Initial Balance: ${this.config.initialBalance.toFixed(4)} SOL
Final Balance: ${result.finalBalance.toFixed(4)} SOL
Total Return: ${(result.totalReturn * 100).toFixed(2)}%
Total PnL: ${result.totalPnL.toFixed(4)} SOL

Trading Statistics:
- Total Trades: ${result.totalTrades}
- Winning Trades: ${result.winningTrades}
- Losing Trades: ${result.losingTrades}
- Win Rate: ${(result.winRate * 100).toFixed(2)}%
- Average Win: ${result.avgWin.toFixed(4)} SOL
- Average Loss: ${result.avgLoss.toFixed(4)} SOL

Risk Metrics:
- Max Drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%
- Sharpe Ratio: ${result.sharpeRatio.toFixed(4)}
    `.trim();
  }
}
