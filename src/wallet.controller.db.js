const WalletModel = require('../models/wallet.model.db');
const { v4: uuidv4 } = require('uuid');

class WalletController {
    async getBalance(req, res) {
        try {
            const userId = req.user.id;
            const wallet = await WalletModel.getWalletByUserId(userId);
            
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
            console.error('Erreur getBalance:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur serveur' 
            });
        }
    }

    async getDashboardData(req, res) {
        try {
            const userId = req.user.id;
            const dashboardData = await WalletModel.getDashboardData(userId);
            
            if (!dashboardData) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Données non trouvées' 
                });
            }

            res.json({
                success: true,
                dashboard: dashboardData
            });
        } catch (error) {
            console.error('Erreur getDashboardData:', error);
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
            
            if (!to || !amount || !symbol) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Destinataire, montant et symbole requis' 
                });
            }
            
            if (amount <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Le montant doit être supérieur à 0' 
                });
            }
            
            const wallet = await WalletModel.getWalletByUserId(userId);
            const asset = wallet.assets.find(a => a.symbol === symbol);
            
            if (!asset || asset.balance < amount) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Solde insuffisant' 
                });
            }
            
            const txHash = `0x${uuidv4().replace(/-/g, '').substring(0, 16)}`;
            
            // Créer la transaction
            await WalletModel.createTransaction(wallet.id, 'send', amount, symbol, to, txHash);
            
            res.json({
                success: true,
                message: 'Transaction envoyée avec succès',
                transaction: { txHash, amount, symbol, to }
            });
        } catch (error) {
            console.error('Erreur sendTransaction:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur lors de l\'envoi' 
            });
        }
    }

    async getTransactions(req, res) {
        try {
            const userId = req.user.id;
            const wallet = await WalletModel.getWalletByUserId(userId);
            
            res.json({
                success: true,
                transactions: wallet.transactions || []
            });
        } catch (error) {
            console.error('Erreur getTransactions:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur lors de la récupération des transactions' 
            });
        }
    }

    async getAssetDetails(req, res) {
        try {
            const { symbol } = req.params;
            const userId = req.user.id;
            const wallet = await WalletModel.getWalletByUserId(userId);
            
            const asset = wallet.assets.find(a => a.symbol === symbol.toUpperCase());
            if (!asset) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Crypto non trouvée' 
                });
            }

            res.json({
                success: true,
                asset: {
                    symbol: asset.symbol,
                    name: asset.name,
                    balance: asset.balance,
                    usdValue: asset.usd_value
                }
            });
        } catch (error) {
            console.error('Erreur getAssetDetails:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur serveur' 
            });
        }
    }
}

module.exports = new WalletController();