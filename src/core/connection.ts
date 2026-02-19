import { Connection as SolanaConnection, PublicKey, Commitment } from '@solana/web3.js';
import { Logger } from './logger';
import config from '../config/env';

export class Connection {
  private static instance: Connection;
  public connection: SolanaConnection;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('Connection');
    
    try {
      this.connection = new SolanaConnection(config.RPC_URL, {
        commitment: 'confirmed' as Commitment,
        wsEndpoint: config.RPC_WS_URL,
      });
      
      this.logger.info(`Connected to Solana RPC: ${config.RPC_URL}`);
    } catch (error) {
      this.logger.error('Failed to initialize Solana connection:', error);
      throw error;
    }
  }

  static getInstance(): Connection {
    if (!Connection.instance) {
      Connection.instance = new Connection();
    }
    return Connection.instance;
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return balance;
    } catch (error) {
      this.logger.error(`Failed to get balance for ${publicKey.toString()}:`, error);
      throw error;
    }
  }

  async getAccountInfo(publicKey: PublicKey) {
    try {
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      return accountInfo;
    } catch (error) {
      this.logger.error(`Failed to get account info for ${publicKey.toString()}:`, error);
      throw error;
    }
  }

  async getTokenAccountsByOwner(owner: PublicKey, programId: PublicKey) {
    try {
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(owner, {
        programId,
      });
      return tokenAccounts;
    } catch (error) {
      this.logger.error(`Failed to get token accounts for ${owner.toString()}:`, error);
      throw error;
    }
  }

  async getRecentBlockhash() {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash();
      return blockhash;
    } catch (error) {
      this.logger.error('Failed to get recent blockhash:', error);
      throw error;
    }
  }

  async getSlot() {
    try {
      const slot = await this.connection.getSlot();
      return slot;
    } catch (error) {
      this.logger.error('Failed to get current slot:', error);
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Use getVersion() as a health check since getHealth() doesn't exist
      const version = await this.connection.getVersion();
      this.logger.debug('Solana RPC version:', version);
      return true;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }

  async reconnect(): Promise<void> {
    try {
      this.logger.info('Reconnecting to Solana RPC...');
      this.connection = new SolanaConnection(config.RPC_URL, {
        commitment: 'confirmed' as Commitment,
        wsEndpoint: config.RPC_WS_URL,
      });
      this.logger.info('Reconnected successfully');
    } catch (error) {
      this.logger.error('Failed to reconnect:', error);
      throw error;
    }
  }
}
