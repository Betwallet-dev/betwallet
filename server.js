const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

// ==================== CHARGEMENT DE LA BASE DE DONNÉES ====================
let db;
let initPath = null;

// Liste des chemins possibles pour trouver init.js
const possiblePaths = [
    path.join(__dirname, 'backend', 'src', 'database', 'init.js'),
    path.join(__dirname, 'src', 'database', 'init.js'),
    path.join(__dirname, 'database', 'init.js')
];

console.log('📁 __dirname =', __dirname);
console.log('🔍 Recherche du fichier init.js...');

for (const p of possiblePaths) {
    console.log('   Test:', p);
    if (fs.existsSync(p)) {
        initPath = p;
        console.log('   ✅ TROUVÉ !');
        break;
    }
}

if (!initPath) {
    console.error('❌ Fichier init.js introuvable dans aucun chemin');
    process.exit(1);
}

try {
    db = require(initPath);
    console.log('✅ Base de données chargée depuis:', initPath);
} catch (err) {
    console.error('❌ Erreur chargement de la base de données:', err.message);
    process.exit(1);
}

// ==================== CONFIGURATION EXPRESS ====================
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir le frontend statique
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== ROUTES API ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'BetWallet API is running',
        timestamp: new Date().toISOString()
    });
});

// Route d'inscription
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
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email déjà utilisé' 
            });
        }
        
        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = `BetWallet_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Créer l'utilisateur
        const userId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (username, email, password, wallet_address) 
                    VALUES (?, ?, ?, ?)`,
                [username, email, hashedPassword, walletAddress],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                });
        });
        
        // Créer le portefeuille
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO wallets (user_id, address, balance) 
                    VALUES (?, ?, ?)`,
                [userId, walletAddress, 1000],
                function(err) {
                    if (err) reject(err);
                    resolve();
                });
        });
        
        // Ajouter les actifs par défaut
        const assets = [
            { symbol: 'BET', name: 'Bet Token', balance: 1000, usdValue: 1000 },
            { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400 },
            { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500 }
        ];
        
        for (const asset of assets) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO assets (wallet_id, symbol, balance, usd_value) 
                        VALUES (?, ?, ?, ?)`,
                    [userId, asset.symbol, asset.balance, asset.usdValue],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    });
            });
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

// Route de connexion
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email et mot de passe requis' 
            });
        }
        
        // Chercher l'utilisateur
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Email ou mot de passe incorrect' 
            });
        }
        
        // Vérifier le mot de passe
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'Email ou mot de passe incorrect' 
            });
        }
        
        // Générer le token
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

// Route du tableau de bord
app.get('/api/wallet/dashboard', async (req, res) => {
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
        const assets = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM assets WHERE wallet_id = ?', [userId], (err, rows) => {
                if (err) reject(err);
                resolve(rows || []);
            });
        });
        
        // Récupérer le portefeuille
        const wallet = await new Promise((resolve, reject) => {
            db.get('SELECT balance FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        
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
                    name: a.symbol,
                    balance: a.balance,
                    usdValue: a.usd_value,
                    icon: '💰'
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

// Route de base pour le frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ==================== DÉMARRAGE DU SERVEUR ====================
app.listen(PORT, () => {
    console.log(`\n🚀 BetWallet API démarrée sur http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 Frontend: http://localhost:${PORT}/\n`);
});