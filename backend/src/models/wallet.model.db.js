const db = require('../database/init');

class WalletModelDB {
    static async getWalletByUserId(userId) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM wallets WHERE user_id = ?`, [userId], (err, wallet) => {
                if (err) reject(err);
                
                if (!wallet) {
                    resolve(null);
                    return;
                }
                
                // Récupérer les actifs
                db.all(`SELECT * FROM assets WHERE wallet_id = ?`, [wallet.id], (err, assets) => {
                    if (err) reject(err);
                    
                    // Récupérer les transactions récentes
                    db.all(`SELECT * FROM transactions WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 10`, 
                        [wallet.id], (err, transactions) => {
                        if (err) reject(err);
                        
                        resolve({
                            ...wallet,
                            assets: assets,
                            transactions: transactions
                        });
                    });
                });
            });
        });
    }

    static async updateBalance(walletId, newBalance) {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE wallets SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [newBalance, walletId], (err) => {
                if (err) reject(err);
                resolve(true);
            });
        });
    }

    static async createTransaction(walletId, type, amount, symbol, recipient, txHash) {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO transactions (wallet_id, tx_hash, type, amount, symbol, recipient, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [walletId, txHash, type, amount, symbol, recipient, 'completed'], function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            });
        });
    }

    static async getDashboardData(userId) {
        const wallet = await this.getWalletByUserId(userId);
        if (!wallet) return null;
        
        const totalBalance = wallet.assets.reduce((sum, asset) => sum + asset.usd_value, 0);
        
        // Données du graphique (7 jours)
        const chartLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        const chartValues = [];
        
        let currentValue = totalBalance * 0.9;
        for (let i = 0; i < 7; i++) {
            currentValue = currentValue * (1 + (Math.random() - 0.5) * 0.05);
            chartValues.push(Math.round(currentValue));
        }
        
        return {
            totalBalance: totalBalance,
            betBalance: wallet.balance,
            assets: wallet.assets.map(a => ({
                symbol: a.symbol,
                name: a.name,
                balance: a.balance,
                usdValue: a.usd_value,
                icon: a.icon
            })),
            recentTransactions: wallet.transactions.slice(0, 5),
            chartData: {
                labels: chartLabels,
                values: chartValues
            }
        };
    }
}

module.exports = WalletModelDB;