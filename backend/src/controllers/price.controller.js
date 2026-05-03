const priceService = require('../services/price.service');

class PriceController {
    async getPrices(req, res) {
        try {
            const prices = await priceService.getPrices();
            res.json({
                success: true,
                prices: prices,
                lastUpdate: priceService.lastUpdate,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getHistorical(req, res) {
        try {
            const { symbol, days = 7 } = req.params;
            const data = await priceService.getHistoricalData(symbol.toUpperCase(), parseInt(days));
            res.json({ success: true, symbol: symbol.toUpperCase(), data: data });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getGlobal(req, res) {
        try {
            const globalData = await priceService.getGlobalData();
            res.json({ success: true, data: globalData });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getTopGainers(req, res) {
        try {
            const prices = await priceService.getPrices();
            const gainers = Object.entries(prices)
                .map(([symbol, data]) => ({ symbol, change24h: data.change24h, price: data.usd }))
                .sort((a, b) => b.change24h - a.change24h)
                .slice(0, 5);
            res.json({ success: true, gainers });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getTopLosers(req, res) {
        try {
            const prices = await priceService.getPrices();
            const losers = Object.entries(prices)
                .map(([symbol, data]) => ({ symbol, change24h: data.change24h, price: data.usd }))
                .sort((a, b) => a.change24h - b.change24h)
                .slice(0, 5);
            res.json({ success: true, losers });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new PriceController();