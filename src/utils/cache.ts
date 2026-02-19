import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple JSON-based cache for API responses.
 * Stores per-token data for a limited time (default 24h).
 */
export class Cache {
  private cacheDir: string;
  private ttlMs: number;

  constructor(ttlHours = 24) {
    this.cacheDir = path.resolve(".cache");
    this.ttlMs = ttlHours * 60 * 60 * 1000;

    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir);
  }

  private filePath(key: string) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /** Try to read from cache if not expired */
  get<T = any>(key: string): T | null {
    const file = this.filePath(key);
    if (!fs.existsSync(file)) return null;

    const { timestamp, data } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - timestamp > this.ttlMs) return null;

    return data as T;
  }

  /** Save data to cache with timestamp */
  set<T = any>(key: string, data: T) {
    const file = this.filePath(key);
    fs.writeFileSync(
      file,
      JSON.stringify({ timestamp: Date.now(), data }, null, 2)
    );
  }
}
