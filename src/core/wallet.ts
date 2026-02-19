import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Connection } from './connection';
import { Logger } from './logger';
import config from '../config/env';

export class Wallet {
  private keypair: Keypair;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('Wallet');
    
    try {
      // Parse private key from environment
      const privateKeyArray = JSON.parse(config.PRIVATE_KEY);
      this.keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      this.logger.info(`Wallet initialized with address: ${this.keypair.publicKey.toString()}`);
    } catch (error) {
      this.logger.error('Failed to initialize wallet:', error);
      throw new Error('Invalid private key format');
    }
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  get address(): string {
    return this.keypair.publicKey.toString();
  }

  async getBalance(): Promise<number> {
    try {
      const connection = Connection.getInstance();
      const balance = await connection.getBalance(this.publicKey);
      this.logger.debug(`Wallet balance: ${balance / 1e9} SOL`);
      return balance;
    } catch (error) {
      this.logger.error('Failed to get wallet balance:', error);
      throw error;
    }
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    try {
      transaction.partialSign(this.keypair);
      this.logger.debug('Transaction signed successfully');
      return transaction;
    } catch (error) {
      this.logger.error('Failed to sign transaction:', error);
      throw error;
    }
  }

  async sendTransaction(transaction: Transaction): Promise<string> {
    try {
      const connection = Connection.getInstance();
      const signature = await sendAndConfirmTransaction(
        connection.connection,
        transaction,
        [this.keypair],
        {
          commitment: 'confirmed',
          maxRetries: config.MAX_RETRIES,
        }
      );
      
      this.logger.info(`Transaction sent successfully: ${signature}`);
      return signature;
    } catch (error) {
      this.logger.error('Failed to send transaction:', error);
      throw error;
    }
  }

  async sendAndConfirmTransaction(transaction: Transaction): Promise<string> {
    try {
      const connection = Connection.getInstance();
      const signature = await sendAndConfirmTransaction(
        connection.connection,
        transaction,
        [this.keypair],
        {
          commitment: 'confirmed',
          maxRetries: config.MAX_RETRIES,
        }
      );
      
      this.logger.info(`Transaction confirmed: ${signature}`);
      return signature;
    } catch (error) {
      this.logger.error('Failed to send and confirm transaction:', error);
      throw error;
    }
  }

  // Helper method to create a new keypair (for testing)
  static generateNewKeypair(): Keypair {
    return Keypair.generate();
  }

  // Helper method to get private key as array (for testing)
  getPrivateKeyArray(): number[] {
    return Array.from(this.keypair.secretKey);
  }
}
