const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== BASE DE DONNÉES ====================
const dbPath = path.join(__dirname, 'betwallet.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Table des utilisateurs
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        reset_token TEXT,
        reset_token_expires DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table des wallets
    db.run(`CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    // Table des actifs
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    console.log('✅ Base de données SQLite initialisée');
});

// ==================== FONCTIONS UTILITAIRES ====================
function generateWalletAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        // Vérifier si email existe déjà
        const existing = await new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => resolve(row));
        });
        
        if (existing) {
            return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
        }
        
        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = generateWalletAddress();
        
        // Créer l'utilisateur
        const userId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                [username, email, hashedPassword, walletAddress],
                function(err) { if (err) reject(err); else resolve(this.lastID); });
        });
        
        // Créer le wallet
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO wallets (user_id, address) VALUES (?, ?)`,
                [userId, walletAddress], (err) => { if (err) reject(err); else resolve(); });
        });
        
        // Actifs par défaut
        const defaultAssets = [
            { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850, icon: '₿' },
            { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400, icon: 'Ξ' },
            { symbol: 'BNB', name: 'BNB Smart Chain', balance: 2.5, usdValue: 1320, icon: '🔶' },
            { symbol: 'SOL', name: 'Solana', balance: 10, usdValue: 1400, icon: '◎' },
            { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500, icon: '💵' }
        ];
        
        for (const asset of defaultAssets) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO assets (user_id, symbol, balance, usd_value) VALUES (?, ?, ?, ?)`,
                    [userId, asset.symbol, asset.balance, asset.usdValue],
                    (err) => { if (err) reject(err); else resolve(); });
            });
        }
        
        const token = `token_${userId}_${Date.now()}`;
        
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

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => resolve(row));
        });
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        
        const token = `token_${user.id}_${Date.now()}`;
        
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

// MOT DE PASSE OUBLIÉ - DEMANDER UN RESET
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await new Promise((resolve) => {
            db.get('SELECT id, email FROM users WHERE email = ?', [email], (err, row) => resolve(row));
        });
        
        if (!user) {
            // Pour des raisons de sécurité, on renvoie un message générique
            return res.json({ success: true, message: 'Si cet email existe, vous recevrez un lien de réinitialisation.' });
        }
        
        // Générer un token unique
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(Date.now() + 3600000); // 1 heure
        
        await new Promise((resolve, reject) => {
            db.run(`UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`,
                [resetToken, resetTokenExpires.toISOString(), user.id],
                (err) => { if (err) reject(err); else resolve(); });
        });
        
        // Ici, vous enverriez un vrai email. Pour la démo, on retourne le token.
        // En production, décommentez la partie nodemailer ci-dessous.
        
        res.json({
            success: true,
            message: 'Si cet email existe, vous recevrez un lien de réinitialisation.',
            // En démo, on retourne le token (supprimez en production)
            resetToken: resetToken
        });
        
    } catch (error) {
        console.error('Erreur forgot password:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// VÉRIFIER LE TOKEN DE RÉINITIALISATION
app.post('/api/auth/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        const user = await new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?',
                [token, new Date().toISOString()],
                (err, row) => resolve(row));
        });
        
        if (!user) {
            return res.status(400).json({ success: false, error: 'Lien invalide ou expiré' });
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// RÉINITIALISER LE MOT DE PASSE
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Mot de passe doit contenir au moins 6 caractères' });
        }
        
        const user = await new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?',
                [token, new Date().toISOString()],
                (err, row) => resolve(row));
        });
        
        if (!user) {
            return res.status(400).json({ success: false, error: 'Lien invalide ou expiré' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await new Promise((resolve, reject) => {
            db.run(`UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?`,
                [hashedPassword, user.id],
                (err) => { if (err) reject(err); else resolve(); });
        });
        
        res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
        
    } catch (error) {
        console.error('Erreur reset password:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// DASHBOARD
app.get('/api/wallet/dashboard', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const token = authHeader.split(' ')[1];
    const userId = token.split('_')[1];
    
    db.all('SELECT * FROM assets WHERE user_id = ?', [userId], (err, assets) => {
        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                assets: assets,
                transactions: [
                    { type: 'receive', amount: 0.02, symbol: 'BTC', usdValue: 1140, date: new Date(Date.now() - 2*24*3600000).toISOString(), from: 'Binance' },
                    { type: 'send', amount: 0.5, symbol: 'ETH', usdValue: 1600, date: new Date(Date.now() - 5*24*3600000).toISOString(), to: '0x1234...5678' }
                ]
            }
        });
    });
});

app.post('/api/wallet/send', (req, res) => {
    res.json({ success: true, message: 'Transaction simulée' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
    console.log(`📁 Base de données: ${dbPath}`);
});