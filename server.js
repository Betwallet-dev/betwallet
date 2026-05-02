const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

// Initialisation de la base de données - CHEMIN CORRIGÉ
const possiblePaths = [
    path.join(__dirname, 'backend', 'src', 'database', 'init.js'),
    path.join(__dirname, 'src', 'database', 'init.js')
];

let db;
let initPathFound = null;
for (const p of possiblePaths) {
    try {
        if (require.resolve(p)) {
            db = require(p);
            initPathFound = p;
            break;
        }
    } catch (e) {
        // Ignorer
    }
}

if (!db) {
    console.error('❌ Fichier init.js introuvable. Chemins cherchés:', possiblePaths);
    process.exit(1);
}
console.log(`✅ Base de données chargée depuis: ${initPathFound}`);

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

// Servir le frontend (pour Render)
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API is running' });
});

// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        // Vérifier si l'utilisateur existe
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
        
        // Créer l'utilisateur
        const userId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)',
                [username, email, hashedPassword, walletAddress],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                });
        });
        
        // Créer le portefeuille
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO wallets (user_id, address, balance) VALUES (?, ?, ?)',
                [userId, walletAddress, 1000],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                });
        });
        
        // Ajouter des actifs par défaut
        const assets = [
            { symbol: 'BET', balance: 1000, usdValue: 1000 },
            { symbol: 'BTC', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', balance: 0.8, usdValue: 2400 },
            { symbol: 'USDT', balance: 500, usdValue: 500 }
        ];
        
        for (const asset of assets) {
            await new Promise((resolve, reject) => {
                db.run('INSERT INTO assets (wallet_id, symbol, balance, usd_value) VALUES (?, ?, ?, ?)',
                    [userId, asset.symbol, asset.balance, asset.usdValue],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    });
            });
        }
        
        const token = jwt.sign(
            { id: userId, email },
            process.env.JWT_SECRET || 'betwallet_secret',
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            token,
            user: { id: userId, username, email, walletAddress }
        });
    } catch (error) {
        console.error('Erreur register:', error);
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
        
        const token = jwt.sign(
            { id: user.id, email },
            process.env.JWT_SECRET || 'betwallet_secret',
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
        console.error('Erreur login:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Dashboard
app.get('/api/wallet/dashboard', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'Non autorisé' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'betwallet_secret');
        const userId = decoded.id;
        
        const assets = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM assets WHERE wallet_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows || []);
            });
        });
        
        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                betBalance: assets.find(a => a.symbol === 'BET')?.balance || 0,
                assets: assets,
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

// Page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Démarrage
app.listen(PORT, () => {
    console.log(`🚀 BetWallet API démarrée sur http://localhost:${PORT}`);
});