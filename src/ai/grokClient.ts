/**
 * GrokClient - thin adapter for Grok sentiment analysis.
 *
 * This class intentionally keeps the implementation abstract so you can
 * swap between the official SDK (if available) and a simple HTTP
 * endpoint without changing callers.
 *
 * Security note: No secrets are hardcoded. All sensitive values are read
 * from process.env at runtime.
 */
export class GrokClient {
  private apiKey: string | undefined;
  private sdk: unknown | undefined;

  /**
   * Create a GrokClient.
   * @param apiKey Optional API key; if omitted, reads `process.env.GROK_API_KEY`.
   */
  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GROK_API_KEY;
  }

  /**
   * Perform sentiment analysis.
   *
   * Contract:
   * - Score in [-1, 1], where -1 is very negative and +1 is very positive.
   * - Label is one of 'positive' | 'neutral' | 'negative'.
   * - On validation or runtime failure, returns a neutral result with rationale.
   *
   * Implementation strategy:
   * - If the `@xai/grok` npm SDK is installed, call it here.
   * - Otherwise, POST to `process.env.GROK_ENDPOINT` as a placeholder backend.
   *
   * Rate limits and retries:
   * - For production, add retry/backoff on 429/5xx and idempotent errors.
   * - Consider circuit-breaking and request deduplication under sustained limits.
   *
   * @param text Free-form text to analyze.
   */
  async analyzeText(text: string): Promise<{ score: number; label: 'positive' | 'neutral' | 'negative'; rationale: string }> {
    const cleaned = typeof text === 'string' ? text.trim() : '';
    if (!cleaned) {
      return {
        score: 0,
        label: 'neutral',
        rationale: 'No input text provided.',
      };
    }

    // Try to use official SDK if present. This is a soft, optional dependency.
    await this.loadSdkIfAvailable();
    if (this.sdk) {
      try {
        // Replace this block with actual calls into the official SDK once integrated.
        // Example (illustrative):
        // const client = new GrokSDK({ apiKey: this.apiKey });
        // const result = await client.analyze.sentiment({ text: cleaned });
        // const scoreFromSdk = normalizeScore(result.score);
        // const rationaleFromSdk = result.explanation ?? 'Analyzed via Grok SDK.';
        // return this.buildResult(scoreFromSdk, rationaleFromSdk);

        // Temporary placeholder behavior when SDK is present but not wired:
        // You should delete this placeholder once real SDK wiring is added.
        return {
          score: 0,
          label: 'neutral',
          rationale: 'SDK detected but not wired. Replace with real SDK call.',
        };
      } catch (error) {
        // Add fine-grained handling (e.g., 429 backoff) as needed.
        return {
          score: 0,
          label: 'neutral',
          rationale: `SDK call failed: ${(error as Error).message ?? 'unknown error'}`,
        };
      }
    }

    // Fallback: call an HTTP endpoint if provided.
    const endpoint = process.env.GROK_ENDPOINT;
    if (!endpoint) {
      return {
        score: 0,
        label: 'neutral',
        rationale: 'No SDK available and GROK_ENDPOINT not configured.',
      };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      // NOTE: Replace this with your real backend contract. This is a generic placeholder.
      const response = await this.safeFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: cleaned }),
      });

      if (!response.ok) {
        // Consider handling 429 with retry/backoff here.
        return {
          score: 0,
          label: 'neutral',
          rationale: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        data = undefined;
      }

      const { score, rationale } = this.extractScoreAndRationale(data);
      return this.buildResult(score, rationale ?? 'Analyzed via HTTP fallback.');
    } catch (error) {
      return {
        score: 0,
        label: 'neutral',
        rationale: `Request failed: ${(error as Error).message ?? 'unknown error'}`,
      };
    }
  }

  private async loadSdkIfAvailable(): Promise<void> {
    if (this.sdk !== undefined) return; // Already attempted
    try {
      // Dynamic import keeps @xai/grok optional.
      // TODO: Uncomment when @xai/grok package is available
      // const maybe = await import('@xai/grok');
      // this.sdk = maybe || null;
      this.sdk = null; // Placeholder until @xai/grok is available
    } catch {
      this.sdk = null;
    }
  }

  private buildResult(scoreRaw: number, rationale: string): { score: number; label: 'positive' | 'neutral' | 'negative'; rationale: string } {
    const score = this.clampScore(scoreRaw);
    const label = this.scoreToLabel(score);
    return { score, label, rationale };
  }

  private clampScore(score: unknown): number {
    const num = typeof score === 'number' && Number.isFinite(score) ? score : 0;
    if (num > 1) return 1;
    if (num < -1) return -1;
    return num;
  }

  private scoreToLabel(score: number): 'positive' | 'neutral' | 'negative' {
    if (score > 0.15) return 'positive';
    if (score < -0.15) return 'negative';
    return 'neutral';
  }

  private extractScoreAndRationale(data: unknown): { score: number; rationale?: string } {
    // Try a few common shapes to be resilient to backend changes.
    // You should tighten this once your backend schema is finalized.
    try {
      const anyData = data as Record<string, unknown> | undefined;
      if (!anyData) return { score: 0 };

      // direct score
      if (typeof anyData.score === 'number') {
        return { score: this.clampScore(anyData.score), rationale: this.asString(anyData.rationale) || undefined };
      }

      // nested sentiment object
      const sentiment = anyData.sentiment as Record<string, unknown> | undefined;
      if (sentiment && typeof sentiment.score === 'number') {
        return { score: this.clampScore(sentiment.score), rationale: this.asString(sentiment.rationale ?? sentiment.explanation) || undefined };
      }

      // label-only
      const label = this.asString(anyData.label);
      if (label === 'positive') return { score: 1, rationale: this.asString(anyData.rationale) || undefined };
      if (label === 'negative') return { score: -1, rationale: this.asString(anyData.rationale) || undefined };
      if (label === 'neutral') return { score: 0, rationale: this.asString(anyData.rationale) || undefined };

      return { score: 0, rationale: this.asString(anyData.rationale ?? anyData.explanation) || undefined };
    } catch {
      return { score: 0 };
    }
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  // Use global fetch when available; otherwise lazily require('node-fetch') if present.
  private async safeFetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const g = globalThis as unknown as { fetch?: typeof fetch };
    if (typeof g.fetch === 'function') {
      return g.fetch(input, init);
    }
    // Lazy-load node-fetch only if necessary and installed. This keeps dependencies optional.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeFetch = require('node-fetch') as typeof fetch;
      return nodeFetch(input as unknown as string, init as unknown as Parameters<typeof nodeFetch>[1]);
    } catch {
      throw new Error('No fetch implementation available. Use Node 18+ or install node-fetch.');
    }
  }
}

export default GrokClient;
