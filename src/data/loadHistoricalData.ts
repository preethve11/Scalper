import { fetchCoinGeckoData } from './providers/coingeckoProvider';
import { fetchHeliusData } from './providers/heliusProvider';

export async function loadHistoricalData(symbol: string, from: Date, to: Date) {
	 try {
		 return await fetchHeliusData(symbol, from, to);
	 } catch (err) {
		 console.warn('⚠️ Helius fetch failed, switching to CoinGecko...');
		 return await fetchCoinGeckoData(symbol, from.getTime(), to.getTime());
	 }
}


