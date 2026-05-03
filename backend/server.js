const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const bip39 = require('bip39');
const { ethers } = require('ethers');

dotenv.config();

// ==================== BASE DE DONNÉES ====================
const dbPath = path.join(__dirname, 'betwallet.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        seed_phrase TEXT NOT NULL,
        eth_address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    console.log('✅ Base de données initialisée');
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware Auth
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Non autorisé' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token invalide' });
    }
};

// ==================== ROUTES WALLET (TRUST WALLET STYLE) ====================

// Étape 1: Générer seed phrase
app.post('/api/wallet/create', async (req, res) => {
    try {
        const seedPhrase = bip39.generateMnemonic(128);
        res.json({ success: true, wallet: { seedPhrase: seedPhrase } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Étape 2: Confirmer et sauvegarder
app.post('/api/wallet/confirm-create', async (req, res) => {
    try {
        const { seedPhrase } = req.body;
        
        if (!seedPhrase || !bip39.validateMnemonic(seedPhrase)) {
            return res.status(400).json({ success: false, error: 'Seed phrase invalide' });
        }
        
        const ethWallet = ethers.Wallet.fromPhrase(seedPhrase);
        const ethAddress = ethWallet.address;
        
        const username = `user_${Date.now()}`;
        const email = `${username}@temp.com`;
        const hashedPassword = await bcrypt.hash('temp123', 10);
        
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// Importer un wallet existant
app.post('/api/wallet/import', async (req, res) => {
    try {
        const { seedPhrase } = req.body;
        
        if (!seedPhrase || !bip39.validateMnemonic(seedPhrase)) {
            return res.status(400).json({ success: false, error: 'Seed phrase invalide' });
        }
        
        const ethWallet = ethers.Wallet.fromPhrase(seedPhrase);
        const ethAddress = ethWallet.address;
        
        const username = `imported_${Date.now()}`;
        const email = `${username}@temp.com`;
        const hashedPassword = await bcrypt.hash('temp123', 10);
        
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// Récupérer les soldes
app.get('/api/wallet/balances', authMiddleware, async (req, res) => {
    res.json({ success: true, balances: { ethereum: 0.5, bitcoin: 0.02, solana: 5, usdt: 100 } });
});

// Récupérer la seed phrase
app.get('/api/wallet/seed', authMiddleware, async (req, res) => {
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
});

// Récupérer une adresse
app.get('/api/wallet/address/:symbol', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const wallet = await new Promise((resolve) => {
            db.get('SELECT eth_address FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                resolve(row);
            });
        });
        res.json({ success: true, address: wallet?.eth_address || '' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Envoyer une transaction
app.post('/api/wallet/send', authMiddleware, async (req, res) => {
    res.json({ success: true, message: 'Transaction simulée' });
});

// ==================== ROUTES AUTH ====================
app.post('/api/auth/register', async (req, res) => {
    res.json({ success: true, message: 'Inscription désactivée - utilisez la création de wallet' });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await new Promise((resolve) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => resolve(row));
    });
    if (!user) return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.wallet_address } });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Démarrage
app.listen(PORT, () => {
    console.log(`🚀 BetWallet API sur http://localhost:${PORT}`);
});