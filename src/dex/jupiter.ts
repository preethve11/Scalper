import axios, { AxiosResponse } from 'axios';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Logger } from '../core/logger';
import config from '../config/env';

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: any;
  priceImpactPct: string;
  routePlan: any[];
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface TokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
}

export class JupiterDEX {
  private logger: Logger;
  private baseURL: string;

  constructor() {
    this.logger = new Logger('JupiterDEX');
    this.baseURL = config.JUPITER_API_URL;
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = config.SLIPPAGE_BPS
  ): Promise<JupiterQuote> {
    try {
      const params = {
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      };

      this.logger.debug(`Getting quote for ${amount} ${inputMint} -> ${outputMint}`);
      
      const response: AxiosResponse<JupiterQuote> = await axios.get(
        `${this.baseURL}/swap/v1/quote`,
        { params }
      );

      this.logger.debug(`Quote received: ${response.data.outAmount} ${outputMint}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get quote from Jupiter:', error);
      throw error;
    }
  }

  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    wrapAndUnwrapSol: boolean = true
  ): Promise<JupiterSwapResponse> {
    try {
      const requestBody = {
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol,
        useSharedAccounts: true,
        feeAccount: undefined,
        trackingAccount: undefined,
        computeUnitPriceMicroLamports: undefined,
        prioritizationFeeLamports: undefined,
        asLegacyTransaction: false,
        useTokenLedger: false,
        destinationTokenAccount: undefined,
        dynamicComputeUnitLimit: true,
        skipUserAccountsRpcCalls: false,
      };

      this.logger.debug(`Getting swap transaction for user: ${userPublicKey}`);
      
      const response: AxiosResponse<JupiterSwapResponse> = await axios.post(
        `${this.baseURL}/swap/v1/swap`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.debug('Swap transaction received successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get swap transaction from Jupiter:', error);
      throw error;
    }
  }

  async getTokens(): Promise<TokenInfo[]> {
    try {
      this.logger.debug('Fetching token list from Jupiter');
      
      const response: AxiosResponse<{ tokens: TokenInfo[] }> = await axios.get(
        `${this.baseURL}/swap/v1/tokens`
      );

      this.logger.debug(`Retrieved ${response.data.tokens.length} tokens`);
      return response.data.tokens;
    } catch (error) {
      this.logger.error('Failed to get tokens from Jupiter:', error);
      throw error;
    }
  }

  async getTokenPrice(tokenMint: string): Promise<number> {
    try {
      const response = await axios.get(`${this.baseURL}/swap/v1/price`, {
        params: {
          ids: tokenMint,
        },
      });

      const price = response.data.data[tokenMint]?.price;
      if (!price) {
        throw new Error(`Price not found for token ${tokenMint}`);
      }

      this.logger.debug(`Token ${tokenMint} price: $${price}`);
      return price;
    } catch (error) {
      this.logger.error(`Failed to get price for token ${tokenMint}:`, error);
      throw error;
    }
  }

  async getRouteMap(): Promise<Record<string, string[]>> {
    try {
      this.logger.debug('Fetching route map from Jupiter');
      
      const response: AxiosResponse<Record<string, string[]>> = await axios.get(
        `${this.baseURL}/swap/v1/indexed-route-map`
      );

      this.logger.debug('Route map retrieved successfully');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get route map from Jupiter:', error);
      throw error;
    }
  }

  // Helper method to convert transaction string to Transaction object
  deserializeTransaction(transactionString: string): Transaction {
    try {
      const transactionBuf = Buffer.from(transactionString, 'base64');
      return Transaction.from(transactionBuf);
    } catch (error) {
      this.logger.error('Failed to deserialize transaction:', error);
      throw error;
    }
  }

  // Helper method to calculate price impact
  calculatePriceImpact(quote: JupiterQuote): number {
    const priceImpact = parseFloat(quote.priceImpactPct);
    this.logger.debug(`Price impact: ${priceImpact}%`);
    return priceImpact;
  }

  // Helper method to check if route is direct
  isDirectRoute(quote: JupiterQuote): boolean {
    return quote.routePlan.length === 1;
  }
}
