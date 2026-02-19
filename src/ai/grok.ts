import OpenAI from 'openai';

/**
 * Configuration interface for the Grok API client
 */
interface GrokConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Message interface for chat conversations
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Grok API client using OpenAI-compatible SDK
 * Reads configuration from environment variables via dotenvx/dotenv
 * - GROK_API_KEY: API key
 * - GROK_ENDPOINT: Base URL for the OpenAI-compatible endpoint
 * - GROK_MODEL (optional): Model id
 */
export class GrokClient {
  private client: OpenAI;
  private config: GrokConfig;

  constructor(config?: Partial<GrokConfig>) {
    const apiKeyFromEnv = process.env.GROK_API_KEY;
    const baseURLFromEnv = process.env.GROK_ENDPOINT;
    const modelFromEnv = process.env.GROK_MODEL;

    if (!apiKeyFromEnv) {
      throw new Error('GROK_API_KEY environment variable is required');
    }
    if (!baseURLFromEnv) {
      throw new Error('GROK_ENDPOINT environment variable is required');
    }

    this.config = {
      apiKey: apiKeyFromEnv,
      baseURL: baseURLFromEnv,
      model: modelFromEnv || 'gpt-4o-mini',
      maxTokens: 1000,
      temperature: 0.7,
      ...config
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * Send a chat message and get an assistant reply.
   * Provides structured error handling for common HTTP errors.
   */
  async chat(
    prompt: string | ChatMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemMessage?: string;
    }
  ): Promise<string> {
    try {
      let messages: ChatMessage[] = [];

      if (typeof prompt === 'string') {
        if (options?.systemMessage) {
          messages.push({ role: 'system', content: options.systemMessage });
        }
        messages.push({ role: 'user', content: prompt });
      } else {
        messages = prompt;
      }

      const response = await this.client.chat.completions.create({
        model: options?.model || this.config.model,
        messages: messages as any,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
      });

      const reply = response.choices[0]?.message?.content;
      if (!reply) {
        throw new Error('Empty response from Grok endpoint');
      }
      return reply.trim();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('401')) {
        throw new Error('Unauthorized (401): Check GROK_API_KEY');
      }
      if (message.includes('429')) {
        throw new Error('Rate limited (429): Slow down requests');
      }
      if (message.includes('5') && message.includes('0')) {
        throw new Error('Server error: Temporary issue at GROK_ENDPOINT');
      }
      throw new Error(`Grok chat error: ${message}`);
    }
  }

  /**
   * Fetch available models via the OpenAI-compatible models API.
   */
  async getModels(): Promise<string[]> {
    const list = await this.client.models.list();
    return list.data.map(m => m.id);
  }

  /**
   * Validate credentials by issuing a tiny request.
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.chat('ping', { maxTokens: 1 });
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): Omit<GrokConfig, 'apiKey'> {
    const { apiKey, ...rest } = this.config;
    return rest;
  }
}

let grok: GrokClient | null = null;
try {
  grok = new GrokClient();
} catch {
  // silently skip if env is not configured; integration test will report
}

export { grok };

export type { GrokConfig, ChatMessage };

/*
Example Usage:

// Basic usage with string prompt (works with both xAI and Groq)
const response = await grok.chat('What is the current price of Bitcoin?');
console.log(response);

// Usage with system message
const response = await grok.chat(
  'Analyze this trading signal: BUY SOL at $100',
  {
    systemMessage: 'You are a professional cryptocurrency trading analyst.',
    temperature: 0.3
  }
);

// Usage with message array
const messages = [
  { role: 'system', content: 'You are a trading bot assistant.' },
  { role: 'user', content: 'Should I buy SOL now?' },
  { role: 'assistant', content: 'I need more information about market conditions.' },
  { role: 'user', content: 'SOL is at $95, RSI is 45, volume is high.' }
];
const response = await grok.chat(messages);

// Custom configuration for xAI
const xaiGrok = new GrokClient({
  provider: 'xai',
  model: 'grok-beta',
  maxTokens: 2000,
  temperature: 0.5
});

// Custom configuration for Groq
const groqGrok = new GrokClient({
  provider: 'groq',
  model: 'llama-3.1-70b-versatile',
  maxTokens: 2000,
  temperature: 0.5
});

// Validate API key
const isValid = await grok.validateApiKey();
console.log('API key is valid:', isValid);

// Get available models
const models = await grok.getModels();
console.log('Available models:', models);

// Environment Variables:
// For xAI: XAI_API_KEY=xai-your-key-here
// For Groq: GROQ_API_KEY=gsk_your-key-here (or GROK_API_KEY as fallback)
*/
