const db = require('../database/init');

class SwapController {
    async getRate(req, res) {
        try {
            const { from, to, amount } = req.query;
            
            const rates = {
                'BTC_ETH': 16.5, 'ETH_BTC': 0.0606,
                'BTC_USDT': 57000, 'USDT_BTC': 0.0000175,
                'ETH_USDT': 3200, 'USDT_ETH': 0.0003125,
                'BET_BTC': 0.000001, 'BET_ETH': 0.0000165, 'BET_USDT': 1
            };
            
            const key = `${from}_${to}`;
            const rate = rates[key] || 1;
            const estimatedAmount = amount * rate;
            
            res.json({
                success: true, from, to, fromAmount: amount,
                toAmount: estimatedAmount, rate: rate,
                fee: estimatedAmount * 0.001
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async executeSwap(req, res) {
        try {
            const { from, to, amount, userId } = req.body;
            
            const wallet = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });
            
            const rates = {
                'BTC_ETH': 16.5, 'ETH_BTC': 0.0606,
                'BTC_USDT': 57000, 'USDT_BTC': 0.0000175,
                'ETH_USDT': 3200, 'USDT_ETH': 0.0003125,
                'BET_BTC': 0.000001, 'BET_ETH': 0.0000165, 'BET_USDT': 1
            };
            
            const key = `${from}_${to}`;
            const rate = rates[key] || 1;
            const toAmount = amount * rate;
            const fee = toAmount * 0.001;
            const netAmount = toAmount - fee;
            
            await new Promise((resolve, reject) => {
                db.run('UPDATE assets SET balance = balance - ? WHERE wallet_id = ? AND symbol = ?',
                    [amount, wallet.id, from], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            
            await new Promise((resolve, reject) => {
                db.run('UPDATE assets SET balance = balance + ? WHERE wallet_id = ? AND symbol = ?',
                    [netAmount, wallet.id, to], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            
            const txHash = '0x' + Math.random().toString(36).substring(2, 15);
            await new Promise((resolve, reject) => {
                db.run('INSERT INTO transactions (wallet_id, tx_hash, type, amount, symbol, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [wallet.id, txHash, 'swap', amount, from, 'completed'], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            
            res.json({ success: true, message: 'Swap executed successfully', fromAmount: amount, toAmount: netAmount, fee: fee, txHash: txHash });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new SwapController();