const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Stockage en mémoire (pas besoin de sqlite3)
const users = [];

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// Inscription
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
    }
    
    const existing = users.find(u => u.email === email);
    if (existing) {
        return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
    }
    
    const userId = users.length + 1;
    const walletAddress = `0x${crypto.randomBytes(20).toString('hex')}`;
    
    users.push({ id: userId, username, email, password, walletAddress });
    
    const token = `token_${userId}_${Date.now()}`;
    
    res.json({
        success: true,
        token,
        user: { id: userId, username, email, walletAddress }
    });
});

// Connexion
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }
    
    const token = `token_${user.id}_${Date.now()}`;
    
    res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress }
    });
});

// Mot de passe oublié
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.json({ success: true, message: 'Si cet email existe, vous recevrez un lien.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, resetToken: resetToken });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Mot de passe trop court' });
    }
    res.json({ success: true, message: 'Mot de passe réinitialisé' });
});

// Dashboard
app.get('/api/wallet/dashboard', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    res.json({
        success: true,
        dashboard: {
            totalBalance: 7150,
            assets: [
                { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850, icon: '₿' },
                { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400, icon: 'Ξ' },
                { symbol: 'BNB', name: 'BNB Smart Chain', balance: 2.5, usdValue: 1320, icon: '🔶' },
                { symbol: 'SOL', name: 'Solana', balance: 10, usdValue: 1400, icon: '◎' },
                { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500, icon: '💵' }
            ],
            transactions: [
                { type: 'receive', amount: 0.02, symbol: 'BTC', usdValue: 1140, date: new Date().toISOString(), from: 'Binance' }
            ]
        }
    });
});

app.post('/api/wallet/send', (req, res) => {
    res.json({ success: true, message: 'Transaction simulée' });
});

// Routes admin
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@betwallet.com' && password === 'Admin123!') {
        res.json({ success: true, token: 'admin_token' });
    } else {
        res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }
});

app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_token') {
        return res.status(401).json({ success: false });
    }
    res.json({ success: true, users: users.map(u => ({ ...u, password: undefined })) });
});

// Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
    console.log(`🔐 Admin: admin@betwallet.com / Admin123!`);
});