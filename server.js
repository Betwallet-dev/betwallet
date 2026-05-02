const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

dotenv.config();

// ==================== CONNEXION POSTGRESQL ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Création des tables
async function initDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                wallet_address TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS wallets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
                address TEXT UNIQUE NOT NULL,
                balance REAL DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS assets (
                id SERIAL PRIMARY KEY,
                wallet_id INTEGER NOT NULL REFERENCES wallets(id),
                symbol TEXT NOT NULL,
                balance REAL DEFAULT 0,
                usd_value REAL DEFAULT 0
            );
        `);
        console.log('✅ Base de données PostgreSQL initialisée');
    } catch (err) {
        console.error('❌ Erreur init DB:', err);
    } finally {
        client.release();
    }
}

initDatabase();

// ==================== EXPRESS ====================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API is running', database: 'PostgreSQL' });
});

// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = `BetWallet_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        const userResult = await pool.query(
            `INSERT INTO users (username, email, password, wallet_address) VALUES ($1, $2, $3, $4) RETURNING id`,
            [username, email, hashedPassword, walletAddress]
        );
        const userId = userResult.rows[0].id;
        
        await pool.query(`INSERT INTO wallets (user_id, address, balance) VALUES ($1, $2, $3)`, [userId, walletAddress, 1000]);
        
        const assets = [
            { symbol: 'BET', balance: 1000, usdValue: 1000 },
            { symbol: 'BTC', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', balance: 0.8, usdValue: 2400 },
            { symbol: 'USDT', balance: 500, usdValue: 500 }
        ];
        
        for (const asset of assets) {
            await pool.query(`INSERT INTO assets (wallet_id, symbol, balance, usd_value) VALUES ($1, $2, $3, $4)`, 
                [userId, asset.symbol, asset.balance, asset.usdValue]);
        }
        
        const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
        
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
        
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        
        const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET || 'betwallet_secret', { expiresIn: '7d' });
        
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.wallet_address } });
    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Dashboard
app.get('/api/wallet/dashboard', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, error: 'Non autorisé' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret');
        const userId = decoded.id;
        
        const assetsResult = await pool.query('SELECT * FROM assets WHERE wallet_id = $1', [userId]);
        const walletResult = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        
        const totalBalance = assetsResult.rows.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                betBalance: walletResult.rows[0]?.balance || 0,
                assets: assetsResult.rows.map(a => ({ symbol: a.symbol, name: a.symbol, balance: a.balance, usdValue: a.usd_value, icon: '💰' })),
                recentTransactions: [],
                chartData: { labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], values: [totalBalance * 0.95, totalBalance * 0.97, totalBalance * 0.96, totalBalance * 0.98, totalBalance * 0.99, totalBalance * 0.98, totalBalance] }
            }
        });
    } catch (error) {
        console.error('Erreur dashboard:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'frontend', 'index.html')); });

app.listen(PORT, () => { console.log(`🚀 BetWallet API sur http://localhost:${PORT}`); });