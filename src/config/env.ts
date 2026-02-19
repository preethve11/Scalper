import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in the project root
dotenv.config({ override: true });

export interface Config {
  // Solana RPC Configuration
  RPC_URL: string;
  RPC_WS_URL?: string;
  
  // Wallet Configuration
  PRIVATE_KEY: string;
  WALLET_ADDRESS?: string;
  
  // Jupiter API Configuration
  JUPITER_API_URL: string;
  
  // Trading Configuration
  SLIPPAGE_BPS: number;
  MAX_RETRIES: number;
  RETRY_DELAY_MS: number;
  
  // Logging Configuration
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  
  // Backtest Configuration
  BACKTEST_START_DATE?: string;
  BACKTEST_END_DATE?: string;
  BACKTEST_INITIAL_BALANCE: number;
}

const config: Config = {
  RPC_URL: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  RPC_WS_URL: process.env.RPC_WS_URL,
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  WALLET_ADDRESS: process.env.WALLET_ADDRESS,
  JUPITER_API_URL: process.env.JUPITER_API_URL || 'https://api.jup.ag',
  SLIPPAGE_BPS: parseInt(process.env.SLIPPAGE_BPS || '50'),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '1000'),
  LOG_LEVEL: (process.env.LOG_LEVEL as Config['LOG_LEVEL']) || 'info',
  BACKTEST_START_DATE: process.env.BACKTEST_START_DATE,
  BACKTEST_END_DATE: process.env.BACKTEST_END_DATE,
  BACKTEST_INITIAL_BALANCE: parseFloat(process.env.BACKTEST_INITIAL_BALANCE || '1000'),
};


// Validate required configuration
if (!config.PRIVATE_KEY) {
  throw new Error('PRIVATE_KEY environment variable is required');
}

export default config;
