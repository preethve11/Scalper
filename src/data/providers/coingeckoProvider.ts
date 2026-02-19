import axios from 'axios';

export interface Candle {
	 time: number;
	 open: number;
	 high: number;
	 low: number;
	 close: number;
}

const SYMBOL_TO_ID: Record<string, string> = {
	 BTC: 'bitcoin',
	 ETH: 'ethereum',
	 SOL: 'solana',
};

export async function fetchCoinGeckoData(symbol: string, from: number, to: number): Promise<Candle[]> {
	 const coinId = SYMBOL_TO_ID[symbol.toUpperCase()];
	 if (!coinId) throw new Error(`Unsupported symbol: ${symbol}`);

	 const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${Math.floor(from / 1000)}&to=${Math.floor(to / 1000)}`;

	 const { data } = await axios.get(url);

	 if (!data?.prices) throw new Error('Invalid CoinGecko response');

	 return data.prices.map(([timestamp, price]: [number, number]) => ({
		 time: timestamp,
		 open: price,
		 high: price,
		 low: price,
		 close: price,
	 }));
}


