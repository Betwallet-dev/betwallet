const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIo = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

dotenv.config();

// ==================== BASE DE DONNÉES ====================
const dbPath = path.join(__dirname, 'betwallet.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Table users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table wallets (version Trust Wallet)
    db.run(`CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        seed_phrase TEXT NOT NULL,
        eth_address TEXT UNIQUE NOT NULL,
        btc_address TEXT,
        sol_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    // Table assets
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )`);
    
    // Table transactions
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('send', 'receive', 'swap')),
        amount REAL NOT NULL,
        symbol TEXT NOT NULL,
        recipient TEXT,
        tx_hash TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )`);
    
    console.log('✅ Base de données initialisée');
});

// ==================== IMPORT DES CONTROLLERS ====================
// Import du controller wallet
const WalletController = require('./src/controllers/wallet.controller');

// ==================== EXPRESS APP ====================
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== SÉCURITÉ ====================
app.use(helmet({
    contentSecurityPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Trop de requêtes, veuillez réessayer plus tard.'
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true
});

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== MIDDLEWARE AUTH ====================
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token invalide' });
    }
};

// ==================== ROUTES PUBLIQUES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API is running', timestamp: new Date().toISOString() });
});

// ==================== ROUTES AUTH ====================
// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = `0x${Math.random().toString(36).substring(2, 15)}${Date.now()}`;
        
        const userId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                [username, email, hashedPassword, walletAddress],
                function(err) { if (err) reject(err); resolve(this.lastID); });
        });
        
        const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'betwallet_secret_key', { expiresIn: '7d' });
        
        res.status(201).json({ success: true, token, user: { id: userId, username, email, walletAddress } });
    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        
        const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET || 'betwallet_secret_key', { expiresIn: '7d' });
        
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.wallet_address } });
    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES WALLET (Trust Wallet Style) ====================
app.post('/api/wallet/create', WalletController.createWallet);
app.post('/api/wallet/confirm-create', WalletController.confirmCreateWallet);
app.post('/api/wallet/import', WalletController.importWallet);
app.get('/api/wallet/balances', authMiddleware, WalletController.getBalances);
app.get('/api/wallet/seed', authMiddleware, WalletController.getSeedPhrase);
app.get('/api/wallet/address/:symbol', authMiddleware, WalletController.getAddress);
app.post('/api/wallet/send', authMiddleware, WalletController.sendTransaction);

// ==================== ROUTES DASHBOARD ====================
app.get('/api/wallet/dashboard', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const wallet = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
        const assets = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM assets WHERE wallet_id = ?', [wallet?.id || 0], (err, rows) => {
                if (err) reject(err);
                resolve(rows || []);
            });
        });
        
        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                betBalance: 0,
                assets: assets.length > 0 ? assets : [
                    { symbol: 'ETH', name: 'Ethereum', balance: 0.5, usdValue: 1600, icon: '💎' },
                    { symbol: 'BTC', name: 'Bitcoin', balance: 0.02, usdValue: 1140, icon: '₿' },
                    { symbol: 'SOL', name: 'Solana', balance: 5, usdValue: 700, icon: '◎' }
                ],
                recentTransactions: [],
                chartData: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                    values: [1000, 1200, 1150, 1300, 1450, 1400, 1500]
                }
            }
        });
    } catch (error) {
        console.error('Erreur dashboard:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'dashboard.html'));
});

// ==================== WEBSOCKET (Prix temps réel) ====================
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
    console.log('🔌 Client WebSocket connecté');
    
    const interval = setInterval(() => {
        const prices = {
            BTC: { usd: 57000 + (Math.random() - 0.5) * 1000, change24h: (Math.random() - 0.5) * 5 },
            ETH: { usd: 3200 + (Math.random() - 0.5) * 50, change24h: (Math.random() - 0.5) * 5 },
            SOL: { usd: 140 + (Math.random() - 0.5) * 5, change24h: (Math.random() - 0.5) * 5 },
            USDT: { usd: 1, change24h: 0 }
        };
        socket.emit('price-update', { prices: prices, timestamp: new Date().toISOString() });
    }, 5000);
    
    socket.on('disconnect', () => {
        clearInterval(interval);
        console.log('🔌 Client WebSocket déconnecté');
    });
});

// ==================== DÉMARRAGE ====================
server.listen(PORT, () => {
    console.log(`\n🚀 BetWallet API démarrée sur http://localhost:${PORT}`);
    console.log(`📡 WebSocket actif sur ws://localhost:${PORT}`);
    console.log(`🌐 Frontend: http://localhost:${PORT}\n`);
});

module.exports = app;