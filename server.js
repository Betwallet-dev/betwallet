const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Base de données
const dbPath = path.join(__dirname, 'betwallet.db');
const db = new sqlite3.Database(dbPath);

// Création des tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    console.log('✅ Base de données initialisée');
});

// Middleware Auth
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token invalide' });
    }
};

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running', timestamp: new Date().toISOString() });
});

// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        const existing = await new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
                resolve(row);
            });
        });
        
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = `0x${Math.random().toString(36).substring(2, 15)}${Date.now()}`;
        
        const userId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                [username, email, hashedPassword, walletAddress],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
        
        const assets = [
            { symbol: 'BTC', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', balance: 0.8, usdValue: 2400 },
            { symbol: 'SOL', balance: 10, usdValue: 1400 },
            { symbol: 'USDT', balance: 500, usdValue: 500 }
        ];
        
        for (const asset of assets) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO assets (user_id, symbol, balance, usd_value) VALUES (?, ?, ?, ?)`,
                    [userId, asset.symbol, asset.balance, asset.usdValue],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });
        }
        
        const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
        
        res.json({
            success: true,
            token,
            user: { id: userId, username, email, walletAddress }
        });
        
    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
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
        
        const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                walletAddress: user.wallet_address
            }
        });
        
    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Dashboard
app.get('/api/wallet/dashboard', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const assets = await new Promise((resolve) => {
            db.all('SELECT * FROM assets WHERE user_id = ?', [userId], (err, rows) => {
                resolve(rows || []);
            });
        });
        
        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                assets: assets,
                chartData: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                    values: [totalBalance * 0.95, totalBalance * 0.97, totalBalance * 0.96, totalBalance * 0.98, totalBalance * 0.99, totalBalance * 0.98, totalBalance || 1000]
                }
            }
        });
    } catch (error) {
        console.error('Erreur dashboard:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Envoi
app.post('/api/wallet/send', authMiddleware, async (req, res) => {
    res.json({ success: true, message: 'Transaction simulée' });
});

// Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Démarrer
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BetWallet API sur http://0.0.0.0:${PORT}`);
});