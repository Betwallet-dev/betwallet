const axios = require('axios');

// Liste des cryptos supportées
const CRYPTO_LIST = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'MATIC': 'polygon',
    'DOT': 'polkadot',
    'AVAX': 'avalanche-2',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'ATOM': 'cosmos',
    'LTC': 'litecoin',
    'BCH': 'bitcoin-cash',
    'NEAR': 'near',
    'ALGO': 'algorand',
    'ICP': 'internet-computer',
    'VET': 'vechain'
};

class PriceService {
    constructor() {
        this.cache = {};
        this.lastUpdate = null;
    }

    async getPrices() {
        try {
            const ids = Object.values(CRYPTO_LIST).join(',');
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
            );
            
            const prices = {};
            for (const [symbol, id] of Object.entries(CRYPTO_LIST)) {
                if (response.data[id]) {
                    prices[symbol] = {
                        usd: response.data[id].usd,
                        change24h: response.data[id].usd_24h_change || 0,
                        marketCap: response.data[id].usd_market_cap || 0,
                        volume24h: response.data[id].usd_24h_vol || 0
                    };
                }
            }
            
            this.cache = prices;
            this.lastUpdate = new Date();
            return prices;
        } catch (error) {
            console.error('Erreur API CoinGecko:', error.message);
            return this.cache;
        }
    }

    async getHistoricalData(symbol, days = 7) {
        try {
            const id = CRYPTO_LIST[symbol];
            if (!id) return null;
            
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
            );
            
            return response.data.prices.map(price => ({
                timestamp: price[0],
                price: price[1]
            }));
        } catch (error) {
            console.error('Erreur historique:', error.message);
            return null;
        }
    }

    async getGlobalData() {
        try {
            const response = await axios.get('https://api.coingecko.com/api/v3/global');
            return response.data.data;
        } catch (error) {
            console.error('Erreur global:', error.message);
            return null;
        }
    }
}

module.exports = new PriceService();