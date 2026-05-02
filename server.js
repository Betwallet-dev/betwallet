const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

dotenv.config();

// ==================== BASE DE DONNÉES ====================
console.log('=== DÉMARRAGE DE BETWALLET API ===');
console.log('📁 Dossier racine :', __dirname);

// Chemin de la base de données
const dbPath = path.join(__dirname, 'betwallet.db');
console.log('📁 Base de données :', dbPath);

// Création/ouverture de la base
const db = new Database(dbPath);

// Création des tables
console.log('📦 Création des tables...');
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        address TEXT UNIQUE NOT NULL,
        balance REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        icon TEXT DEFAULT '💰',
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('send', 'receive')),
        amount REAL NOT NULL,
        symbol TEXT NOT NULL,
        recipient TEXT,
        tx_hash TEXT UNIQUE,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );
`);
console.log('✅ Tables créées/vérifiées');

// ==================== EXPRESS ====================
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir le frontend statique
const frontendPath = path.join(__dirname, 'frontend');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    console.log('✅ Frontend servi depuis :', frontendPath);
}

// ==================== ROUTES API ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'BetWallet API is running',
        timestamp: new Date().toISOString(),
        database: 'SQLite (better-sqlite3)'
    });
});

// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Tous les champs sont requis'
            });
        }

        // Vérifier si l'utilisateur existe déjà
        const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Email déjà utilisé'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = `BetWallet_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Insérer l'utilisateur
        const insertUser = db.prepare(`
            INSERT INTO users (username, email, password, wallet_address)
            VALUES (?, ?, ?, ?)
        `);
        const userResult = insertUser.run(username, email, hashedPassword, walletAddress);
        const userId = userResult.lastInsertRowid;

        // Créer le portefeuille
        const insertWallet = db.prepare(`
            INSERT INTO wallets (user_id, address, balance) VALUES (?, ?, ?)
        `);
        insertWallet.run(userId, walletAddress, 1000);

        // Ajouter les actifs par défaut
        const assets = [
            { symbol: 'BET', name: 'Bet Token', balance: 1000, usdValue: 1000 },
            { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400 },
            { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500 }
        ];

        const insertAsset = db.prepare(`
            INSERT INTO assets (wallet_id, symbol, name, balance, usd_value)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const asset of assets) {
            insertAsset.run(userId, asset.symbol, asset.name, asset.balance, asset.usdValue);
        }

        // Générer le token JWT
        const token = jwt.sign(
            { id: userId, email },
            process.env.JWT_SECRET || 'betwallet_secret_key',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: userId,
                username,
                email,
                walletAddress
            }
        });

    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'inscription'
        });
    }
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email et mot de passe requis'
            });
        }

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Email ou mot de passe incorrect'
            });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Email ou mot de passe incorrect'
            });
        }

        const token = jwt.sign(
            { id: user.id, email },
            process.env.JWT_SECRET || 'betwallet_secret_key',
            { expiresIn: '7d' }
        );

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
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la connexion'
        });
    }
});

// Dashboard
app.get('/api/wallet/dashboard', (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Non autorisé'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret_key');
        const userId = decoded.id;

        // Récupérer les actifs
        const assets = db.prepare(`
            SELECT symbol, name, balance, usd_value, icon
            FROM assets WHERE wallet_id = ?
        `).all(userId);

        // Récupérer le solde BET
        const wallet = db.prepare(`
            SELECT balance FROM wallets WHERE user_id = ?
        `).get(userId);

        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);

        // Données du graphique (simulées)
        const chartValues = [];
        let currentValue = totalBalance * 0.9;
        for (let i = 0; i < 7; i++) {
            currentValue = currentValue * (1 + (Math.random() - 0.5) * 0.05);
            chartValues.push(Math.round(currentValue));
        }

        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                betBalance: wallet?.balance || 0,
                assets: assets.map(a => ({
                    symbol: a.symbol,
                    name: a.name,
                    balance: a.balance,
                    usdValue: a.usd_value,
                    icon: a.icon || '💰'
                })),
                recentTransactions: [],
                chartData: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                    values: chartValues
                }
            }
        });

    } catch (error) {
        console.error('Erreur dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement du tableau de bord'
        });
    }
});

// Route d'accueil (frontend)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'frontend', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ message: 'BetWallet API is running. Frontend not found.' });
    }
});

// ==================== DÉMARRAGE ====================
app.listen(PORT, () => {
    console.log(`\n🚀 BetWallet API démarrée sur http://localhost:${PORT}`);
    console.log(`📋 Health check : http://localhost:${PORT}/api/health`);
    console.log('====================================\n');
});