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

dotenv.config();

// ==================== BASE DE DONNÉES ====================
let db;
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'betwallet.db');
db = new sqlite3.Database(dbPath);

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
        address TEXT UNIQUE NOT NULL,
        balance REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    )`);
    
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

// ==================== IMPORT DES ROUTES ====================
const priceRoutes = require('./src/routes/price.routes');
const swapRoutes = require('./src/routes/swap.routes');
const priceService = require('./src/services/price.service');

// ==================== EXPRESS APP ====================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== ROUTES API ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API is running', timestamp: new Date().toISOString() });
});

// Auth routes
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
        const walletAddress = `BetWallet_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        const userId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                [username, email, hashedPassword, walletAddress],
                function(err) { if (err) reject(err); resolve(this.lastID); });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO wallets (user_id, address, balance) VALUES (?, ?, ?)`,
                [userId, walletAddress, 1000], function(err) { if (err) reject(err); resolve(); });
        });
        
        const assets = [
            { symbol: 'BET', balance: 1000, usdValue: 1000 },
            { symbol: 'BTC', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', balance: 0.8, usdValue: 2400 },
            { symbol: 'USDT', balance: 500, usdValue: 500 },
            { symbol: 'BNB', balance: 2, usdValue: 1000 },
            { symbol: 'SOL', balance: 10, usdValue: 1500 }
        ];
        
        for (const asset of assets) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO assets (wallet_id, symbol, balance, usd_value) VALUES (?, ?, ?, ?)`,
                    [userId, asset.symbol, asset.balance, asset.usdValue], (err) => {
                    if (err) reject(err); resolve(); });
            });
        }
        
        const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'betwallet_secret_key', { expiresIn: '7d' });
        
        res.status(201).json({ success: true, token, user: { id: userId, username, email, walletAddress } });
    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

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

app.get('/api/wallet/dashboard', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'Non autorisé' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret_key');
        const userId = decoded.id;
        
        const assets = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM assets WHERE wallet_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows || []);
            });
        });
        
        const wallet = await new Promise((resolve, reject) => {
            db.get('SELECT balance FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                betBalance: wallet?.balance || 0,
                assets: assets.map(a => ({ symbol: a.symbol, name: a.symbol, balance: a.balance, usdValue: a.usd_value, icon: '💰' })),
                recentTransactions: [],
                chartData: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                    values: [totalBalance * 0.95, totalBalance * 0.97, totalBalance * 0.96, totalBalance * 0.98, totalBalance * 0.99, totalBalance * 0.98, totalBalance]
                }
            }
        });
    } catch (error) {
        console.error('Erreur dashboard:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== NOUVELLES ROUTES ====================
app.use('/api/prices', priceRoutes);
app.use('/api/swap', swapRoutes);

// ==================== FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// ==================== WEBSOCKET ====================
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
    console.log('🔌 Client WebSocket connecté');
    
    const interval = setInterval(async () => {
        const prices = await priceService.getPrices();
        socket.emit('price-update', { prices: prices, timestamp: new Date().toISOString() });
    }, 5000);
    
    socket.on('disconnect', () => {
        clearInterval(interval);
        console.log('🔌 Client WebSocket déconnecté');
    });
});

// ==================== DÉMARRAGE ====================
server.listen(PORT, () => {
    console.log(`🚀 BetWallet API démarrée sur http://localhost:${PORT}`);
    console.log(`📡 WebSocket actif sur ws://localhost:${PORT}`);
});