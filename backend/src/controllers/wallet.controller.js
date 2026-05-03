const WalletModel = require('../models/wallet.model');
const UserModel = require('../models/user.model');

class WalletController {
    async getBalance(req, res) {
        try {
            const userId = req.user.id;
            const user = UserModel.findById(userId);
            
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Utilisateur non trouvé' 
                });
            }

            const wallet = WalletModel.getWalletByUserId(userId);
            if (!wallet) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Portefeuille non trouvé' 
                });
            }

            res.json({
                success: true,
                balance: wallet.balance,
                assets: wallet.assets,
                address: wallet.address
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: 'Erreur serveur' 
            });
        }
    }

    async getDashboardData(req, res) {
        try {
            const userId = req.user.id;
            const user = UserModel.findById(userId);
            const wallet = WalletModel.getWalletByUserId(userId);
            
            const totalBalance = wallet.assets.reduce((sum, asset) => sum + asset.usdValue, 0);
            
            // Données pour le graphique (7 derniers jours simulés)
            const chartData = {
                labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                values: [totalBalance * 0.95, totalBalance * 0.97, totalBalance * 0.96, 
                         totalBalance * 0.98, totalBalance * 0.99, totalBalance * 0.98, totalBalance]
            };

            res.json({
                success: true,
                dashboard: {
                    totalBalance: totalBalance,
                    betBalance: wallet.balance,
                    assets: wallet.assets,
                    recentTransactions: wallet.transactions.slice(0, 5),
                    chartData: chartData
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur serveur' 
            });
        }
    }

    async sendTransaction(req, res) {
        try {
            const { to, amount, symbol } = req.body;
            const userId = req.user.id;
            const user = UserModel.findById(userId);
            const fromWallet = WalletModel.getWalletByUserId(userId);
            
            if (!to || !amount || !symbol) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Destinataire, montant et symbole requis' 
                });
            }
            
            const asset = fromWallet.assets.find(a => a.symbol === symbol);
            if (!asset || asset.balance < amount) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Solde insuffisant' 
                });
            }
            
            // Mettre à jour le solde
            asset.balance -= amount;
            asset.usdValue = asset.balance * (asset.usdValue / (asset.balance + amount));
            fromWallet.balance -= amount;
            
            // Ajouter la transaction
            const transaction = {
                type: 'send',
                amount: amount,
                symbol: symbol,
                to: to,
                status: 'completed',
                hash: '0x' + Math.random().toString(36).substring(2, 15)
            };
            
            WalletModel.addTransaction(fromWallet.address, transaction);
            
            res.json({
                success: true,
                message: 'Transaction envoyée avec succès',
                transaction: transaction
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: 'Erreur lors de l\'envoi' 
            });
        }
        const { sendTransactionEmail } = require('../services/email.service');

// Dans sendTransaction, après la transaction
await sendTransactionEmail(user.email, {
    type: 'send',
    amount: amount,
    symbol: symbol,
    txHash: txHash
});
    }
}

module.exports = new WalletController();