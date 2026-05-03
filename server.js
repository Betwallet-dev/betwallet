const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

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
        reset_token TEXT,
        reset_token_expires DATETIME,
        total_balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table wallets
    db.run(`CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    // Table assets
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    // Créer le compte admin par défaut
    db.get('SELECT id FROM users WHERE email = ?', ['admin@betwallet.com'], async (err, row) => {
        if (!row) {
            const hashedPassword = await bcrypt.hash('Admin123!', 10);
            const walletAddress = `0xADMIN_${crypto.randomBytes(16).toString('hex')}`;
            db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                ['Administrateur', 'admin@betwallet.com', hashedPassword, walletAddress]);
            console.log('✅ Compte admin créé: admin@betwallet.com / Admin123!');
        } else {
            console.log('✅ Compte admin existant');
        }
    });
    
    console.log('✅ Base de données SQLite initialisée');
});

// ==================== ROUTES ADMIN ====================
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (email !== 'admin@betwallet.com') {
            return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
        }
        
        const admin = await new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE email = ?', ['admin@betwallet.com'], (err, row) => resolve(row));
        });
        
        if (!admin) {
            return res.status(401).json({ success: false, error: 'Admin non trouvé' });
        }
        
        const isValid = await bcrypt.compare(password, admin.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
        }
        
        res.json({ success: true, token: 'admin_secret_token_2024' });
    } catch (error) {
        console.error('Erreur login admin:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/admin/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token === 'admin_secret_token_2024') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token_2024') {
        return res.status(401).json({ success: false });
    }
    
    db.all('SELECT id, username, email, wallet_address, total_balance, created_at FROM users WHERE email != ? ORDER BY id DESC', 
        ['admin@betwallet.com'], 
        (err, users) => {
            if (err) {
                return res.status(500).json({ success: false });
            }
            res.json({ success: true, users: users || [] });
        });
});

// ==================== ROUTES UTILISATEURS ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// Inscription
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        const existing = await new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => resolve(row));
        });
        
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const walletAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
        
        const userId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                [username, email, hashedPassword, walletAddress],
                function(err) { if (err) reject(err); else resolve(this.lastID); });
        });
        
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO wallets (user_id, address) VALUES (?, ?)`,
                [userId, walletAddress], (err) => { if (err) reject(err); else resolve(); });
        });
        
        const defaultAssets = [
            { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850 },
            { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400 },
            { symbol: 'BNB', name: 'BNB Smart Chain', balance: 2.5, usdValue: 1320 },
            { symbol: 'SOL', name: 'Solana', balance: 10, usdValue: 1400 },
            { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500 }
        ];
        
        let totalBalance = 0;
        for (const asset of defaultAssets) {
            totalBalance += asset.usdValue;
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO assets (user_id, symbol, balance, usd_value) VALUES (?, ?, ?, ?)`,
                    [userId, asset.symbol, asset.balance, asset.usdValue],
                    (err) => { if (err) reject(err); else resolve(); });
            });
        }
        
        await new Promise((resolve, reject) => {
            db.run(`UPDATE users SET total_balance = ? WHERE id = ?`, [totalBalance, userId], (err) => {
                if (err) reject(err); else resolve();
            });
        });
        
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

// Connexion
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

// Mot de passe oublié - Demander un reset
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await new Promise((resolve) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => resolve(row));
        });
        
        if (!user) {
            return res.json({ success: true, message: 'Si cet email existe, vous recevrez un lien.' });
        }
        
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(Date.now() + 3600000); // 1 heure
        
        await new Promise((resolve, reject) => {
            db.run(`UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`,
                [resetToken, resetTokenExpires.toISOString(), user.id],
                (err) => { if (err) reject(err); else resolve(); });
        });
        
        res.json({ success: true, resetToken: resetToken });
    } catch (error) {
        console.error('Erreur forgot password:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Vérifier le token de reset
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

// Réinitialiser le mot de passe
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

// Dashboard
app.get('/api/wallet/dashboard', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const userId = token.split('_')[1];
    
    db.all('SELECT * FROM assets WHERE user_id = ?', [userId], (err, assets) => {
        if (err) {
            return res.status(500).json({ success: false });
        }
        
        const totalBalance = assets.reduce((sum, a) => sum + (a.usd_value || 0), 0);
        
        const icons = { BTC: '₿', ETH: 'Ξ', BNB: '🔶', SOL: '◎', USDT: '💵' };
        
        res.json({
            success: true,
            dashboard: {
                totalBalance: totalBalance,
                assets: assets.map(a => ({
                    ...a,
                    icon: icons[a.symbol] || '💰'
                })),
                transactions: []
            }
        });
    });
});

// Envoi de transaction (simulé)
app.post('/api/wallet/send', (req, res) => {
    const { to, amount, symbol } = req.body;
    res.json({
        success: true,
        message: `Transaction de ${amount} ${symbol} vers ${to} simulée`,
        txHash: `0x${crypto.randomBytes(16).toString('hex')}`
    });
});

// Routes frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

app.get('/coin-detail.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'coin-detail.html'));
});

// Démarrer le serveur
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
    console.log(`📁 Page admin: https://supportblockchain.finance/admin.html`);
    console.log(`🔐 Identifiants admin: admin@betwallet.com / Admin123!\n`);
});