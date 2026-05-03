const bip39 = require('bip39');
const { ethers } = require('ethers');
const db = require('../database/init');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class WalletController {
    
    // Étape 1: Générer la seed phrase
    static async createWallet(req, res) {
        try {
            const seedPhrase = bip39.generateMnemonic(128);
            res.json({ success: true, wallet: { seedPhrase: seedPhrase } });
        } catch (error) {
            console.error('Erreur création wallet:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    // Étape 2: Confirmer et sauvegarder
    static async confirmCreateWallet(req, res) {
        try {
            const { seedPhrase } = req.body;
            
            if (!bip39.validateMnemonic(seedPhrase)) {
                return res.status(400).json({ success: false, error: 'Seed phrase invalide' });
            }
            
            const ethWallet = ethers.Wallet.fromPhrase(seedPhrase);
            const ethAddress = ethWallet.address;
            
            const username = `user_${Date.now()}`;
            const email = `${username}@betwallet.temp`;
            const hashedPassword = await bcrypt.hash('temp_' + Date.now(), 10);
            
            const userId = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                    [username, email, hashedPassword, ethAddress],
                    function(err) { if (err) reject(err); resolve(this.lastID); });
            });
            
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO wallets (user_id, seed_phrase, eth_address) VALUES (?, ?, ?)`,
                    [userId, seedPhrase, ethAddress], (err) => {
                    if (err) reject(err); resolve();
                });
            });
            
            const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
            
            res.json({ success: true, token, user: { id: userId, username, email, walletAddress: ethAddress } });
        } catch (error) {
            console.error('Erreur confirmation:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    // Importer un wallet existant
    static async importWallet(req, res) {
        try {
            const { seedPhrase } = req.body;
            
            if (!bip39.validateMnemonic(seedPhrase)) {
                return res.status(400).json({ success: false, error: 'Seed phrase invalide' });
            }
            
            const ethWallet = ethers.Wallet.fromPhrase(seedPhrase);
            const ethAddress = ethWallet.address;
            
            const existing = await new Promise((resolve) => {
                db.get('SELECT * FROM wallets WHERE eth_address = ?', [ethAddress], (err, row) => {
                    resolve(row);
                });
            });
            
            if (existing) {
                return res.status(400).json({ success: false, error: 'Wallet déjà importé' });
            }
            
            const username = `imported_${Date.now()}`;
            const email = `${username}@betwallet.temp`;
            const hashedPassword = await bcrypt.hash('temp_' + Date.now(), 10);
            
            const userId = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                    [username, email, hashedPassword, ethAddress],
                    function(err) { if (err) reject(err); resolve(this.lastID); });
            });
            
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO wallets (user_id, seed_phrase, eth_address) VALUES (?, ?, ?)`,
                    [userId, seedPhrase, ethAddress], (err) => {
                    if (err) reject(err); resolve();
                });
            });
            
            const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
            
            res.json({ success: true, token, user: { id: userId, username, email, walletAddress: ethAddress } });
        } catch (error) {
            console.error('Erreur import:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    // Obtenir les soldes
    static async getBalances(req, res) {
        try {
            const userId = req.user.id;
            
            const wallet = await new Promise((resolve) => {
                db.get('SELECT eth_address FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                    resolve(row);
                });
            });
            
            res.json({
                success: true,
                wallet: wallet,
                balances: { ethereum: 0.5, bitcoin: 0.02, solana: 5, usdt: 100 }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    static async getSeedPhrase(req, res) {
        try {
            const userId = req.user.id;
            const wallet = await new Promise((resolve) => {
                db.get('SELECT seed_phrase FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                    resolve(row);
                });
            });
            res.json({ success: true, seedPhrase: wallet?.seed_phrase || '' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    static async getAddress(req, res) {
        try {
            const { symbol } = req.params;
            const userId = req.user.id;
            
            let addressCol = 'eth_address';
            if (symbol === 'BTC') addressCol = 'eth_address';
            if (symbol === 'SOL') addressCol = 'eth_address';
            
            const wallet = await new Promise((resolve) => {
                db.get(`SELECT ${addressCol} as address FROM wallets WHERE user_id = ?`, [userId], (err, row) => {
                    resolve(row);
                });
            });
            
            res.json({ success: true, address: wallet?.address || 'Adresse non disponible' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    static async sendTransaction(req, res) {
        res.json({ success: true, message: 'Transaction simulée (mode test)' });
    }
}

module.exports = WalletController;