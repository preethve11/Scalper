import * as dotenv from 'dotenv';
dotenv.config();

import { Logger } from './core/logger';
import { Wallet } from './core/wallet';
import { Connection } from './core/connection';
import { JupiterDEX } from './dex/jupiter';
import { SignalGenerator } from './ai/signal';
import { BacktestEngine, type BacktestConfig } from './backtest/engine';
import config from './config/env';
import { startLiveRunner } from './engine/liveRunner';

class ScalperrBot {
  private logger: Logger;
  private wallet: Wallet;
  private connection: Connection;
  private jupiterDEX: JupiterDEX;
  private signalGenerator: SignalGenerator;
  private isRunning: boolean = false;

  constructor() {
    this.logger = new Logger('ScalperrBot');
    this.wallet = new Wallet();
    this.connection = Connection.getInstance();
    this.jupiterDEX = new JupiterDEX();
    this.signalGenerator = new SignalGenerator();
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Scalperr Bot...');

      // Check connection health
      const isHealthy = await this.connection.isHealthy();
      if (!isHealthy) {
        throw new Error('Solana RPC connection is not healthy');
      }

      // Get wallet balance
      const balance = await this.wallet.getBalance();
      this.logger.info(`Wallet balance: ${balance / 1e9} SOL`);

      // Validate Jupiter API connection (skip for now due to network issues)
      try {
        await this.jupiterDEX.getTokens();
        this.logger.info('Jupiter API connection validated');
      } catch (error) {
        this.logger.warn('Jupiter API validation skipped due to network issues:', error instanceof Error ? error.message : String(error));
      }

      this.logger.info('Scalperr Bot initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Scalperr Bot:', error);
      throw error;
    }
  }

  async startTrading(tokens: string[]): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Bot is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting trading for tokens: ${tokens.join(', ')}`);

    try {
      while (this.isRunning) {
        for (const token of tokens) {
          try {
            await this.processToken(token);
          } catch (error) {
            this.logger.error(`Error processing token ${token}:`, error);
          }
        }

        // Wait before next iteration
        await this.sleep(5000); // 5 seconds
      }
    } catch (error) {
      this.logger.error('Trading loop error:', error);
      this.isRunning = false;
    }
  }

  private async processToken(token: string): Promise<void> {
    try {
      // Get current price
      const price = await this.jupiterDEX.getTokenPrice(token);
      
      // Get volume (simplified - in reality you'd get this from a data provider)
      const volume = 1000000; // Placeholder

      // Generate trading signal
      const signal = await this.signalGenerator.generateSignal(token, price, volume);

      // Execute trade if signal is strong enough
      if (signal.confidence > 0.7 && signal.action !== 'HOLD') {
        await this.executeTrade(signal);
      }

    } catch (error) {
      this.logger.error(`Failed to process token ${token}:`, error);
    }
  }

  private async executeTrade(signal: any): Promise<void> {
    try {
      this.logger.info(`Executing ${signal.action} signal for ${signal.token}`);

      // Get quote from Jupiter
      const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
      const outputMint = signal.token;
      const amount = 0.1; // 0.1 SOL

      const quote = await this.jupiterDEX.getQuote(inputMint, outputMint, amount * 1e9);
      
      // Get swap transaction
      const swapResponse = await this.jupiterDEX.getSwapTransaction(
        quote,
        this.wallet.address
      );

      // Deserialize and sign transaction
      const transaction = this.jupiterDEX.deserializeTransaction(swapResponse.swapTransaction);
      const signedTransaction = await this.wallet.signTransaction(transaction);

      // Send transaction
      const signature = await this.wallet.sendTransaction(signedTransaction);
      
      this.logger.trade(signal.action, signal.token, amount, Number(quote.outAmount));
      this.logger.info(`Trade executed: ${signature}`);

    } catch (error) {
      this.logger.error('Failed to execute trade:', error);
    }
  }

  stopTrading(): void {
    this.isRunning = false;
    this.logger.info('Trading stopped');
  }

  async runBacktest(config: BacktestConfig): Promise<void> {
    try {
      this.logger.info('Starting backtest...');
      const backtestEngine = new BacktestEngine(config);
      const marketData = this.generateSampleMarketData(config);
      const result = await backtestEngine.runBacktest(marketData);
      this.logger.info(backtestEngine.generatePerformanceReport(result));
      backtestEngine.exportResultsToCSV(result, 'backtest_results.csv');
    } catch (error) {
      this.logger.error('Backtest failed:', error);
      throw error;
    }
  }

  private generateSampleMarketData(config: BacktestConfig): any[] {
    const data = [];
    const startTime = config.startDate.getTime();
    const endTime = config.endDate.getTime();
    const interval = 60000; // 1 minute intervals

    for (let time = startTime; time <= endTime; time += interval) {
      for (const token of config.tokens) {
        data.push({
          timestamp: new Date(time),
          token,
          price: 100 + Math.random() * 50,
          volume: Math.random() * 1000000,
          marketCap: Math.random() * 10000000,
        });
      }
    }

    return data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getter methods for external access
  getWallet(): Wallet {
    return this.wallet;
  }
  getConnection(): Connection {
    return this.connection;
  }
  getJupiterDEX(): JupiterDEX {
    return this.jupiterDEX;
  }
  getSignalGenerator(): SignalGenerator {
    return this.signalGenerator;
  }
  isTrading(): boolean {
    return this.isRunning;
  }
}

// Main execution: --backtest runs CLI backtest; otherwise starts live runner
async function main() {
  const isBacktest = process.argv.includes('--backtest');
  if (isBacktest) {
    const { runBacktestCLI } = await import('./backtest/runBacktest');
    await runBacktestCLI();
    return;
  }

  const logger = new Logger('ScalperrBot');
  logger.info('Starting Scalperr Bot...');
  logger.info(`RPC URL: ${config.RPC_URL}`);
  logger.info(`Private Key length: ${config.PRIVATE_KEY?.length ?? 0}`);

  await startLiveRunner('SOLUSDT');
}

// Export for use as module
export { ScalperrBot, type BacktestConfig };

// Run if this file is executed directly
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
