// Minimal placeholder Helius provider. Replace with real implementation.
// Expected to return an array of { time, open, high, low, close } candles.

export interface Candle {
	 time: number;
	 open: number;
	 high: number;
	 low: number;
	 close: number;
}

export async function fetchHeliusData(_symbol: string, _from: Date, _to: Date): Promise<Candle[]> {
	 // Throw to exercise the fallback to CoinGecko until Helius is implemented.
	 throw new Error('Helius provider not implemented');
}


