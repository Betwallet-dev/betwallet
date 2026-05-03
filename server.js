const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Stockage en mémoire (persistant)
const users = [];

// Compte admin par défaut
const adminEmail = 'admin@betwallet.com';
const adminPassword = 'Admin123!';

// Liste des cryptos supportées
const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'USDT'];

// ==================== FONCTIONS UTILITAIRES ====================
function generateWalletAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

// ==================== ROUTES PUBLIQUES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// Inscription - SOLDE INITIAL À ZÉRO
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
    const walletAddress = generateWalletAddress();
    
    // Créer les actifs avec SOLDE ZÉRO
    const assets = cryptoSymbols.map(symbol => ({
        symbol: symbol,
        balance: 0,
        usdValue: 0
    }));
    
    users.push({
        id: userId,
        username,
        email,
        password,
        walletAddress,
        assets: assets,
        transactions: [],
        created_at: new Date().toISOString()
    });
    
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
    
    const userId = parseInt(token.split('_')[1]);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const totalBalance = user.assets.reduce((sum, a) => sum + (a.usdValue || 0), 0);
    
    const icons = { BTC: '₿', ETH: 'Ξ', BNB: '🔶', SOL: '◎', USDT: '💵' };
    
    res.json({
        success: true,
        dashboard: {
            totalBalance: totalBalance,
            assets: user.assets.map(a => ({
                ...a,
                name: getCryptoName(a.symbol),
                icon: icons[a.symbol] || '💰'
            })),
            transactions: user.transactions || []
        }
    });
});

function getCryptoName(symbol) {
    const names = {
        BTC: 'Bitcoin',
        ETH: 'Ethereum',
        BNB: 'BNB Smart Chain',
        SOL: 'Solana',
        USDT: 'Tether'
    };
    return names[symbol] || symbol;
}

// Envoi de transaction (pour les utilisateurs)
app.post('/api/wallet/send', (req, res) => {
    const { to, amount, symbol } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const userId = parseInt(token.split('_')[1]);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const asset = user.assets.find(a => a.symbol === symbol);
    if (!asset || asset.balance < amount) {
        return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    // Déduire le montant
    asset.balance -= amount;
    asset.usdValue = asset.balance * getCryptoPrice(symbol);
    
    // Ajouter la transaction
    user.transactions.unshift({
        type: 'send',
        symbol: symbol,
        amount: amount,
        to: to,
        date: new Date().toISOString(),
        usdValue: amount * getCryptoPrice(symbol)
    });
    
    res.json({ success: true, message: 'Transaction envoyée', txHash: `0x${crypto.randomBytes(16).toString('hex')}` });
});

function getCryptoPrice(symbol) {
    const prices = { BTC: 57000, ETH: 3200, BNB: 520, SOL: 140, USDT: 1 };
    return prices[symbol] || 0;
}

// ==================== ROUTES ADMIN ====================
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === adminEmail && password === adminPassword) {
        res.json({ success: true, token: 'admin_secret_token' });
    } else {
        res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }
});

app.get('/api/admin/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token === 'admin_secret_token') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// Récupérer tous les utilisateurs (pour admin)
app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const usersList = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        walletAddress: u.walletAddress,
        assets: u.assets,
        transactions: u.transactions,
        created_at: u.created_at
    }));
    
    res.json({ success: true, users: usersList });
});

// Envoyer des cryptos à un utilisateur (admin)
app.post('/api/admin/send-crypto', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, amount } = req.body;
    
    if (!userId || !symbol || !amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Données invalides' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const asset = user.assets.find(a => a.symbol === symbol);
    if (!asset) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    // Ajouter le montant
    asset.balance += amount;
    asset.usdValue = asset.balance * getCryptoPrice(symbol);
    
    // Ajouter la transaction
    user.transactions.unshift({
        type: 'receive',
        symbol: symbol,
        amount: amount,
        from: 'Admin',
        date: new Date().toISOString(),
        usdValue: amount * getCryptoPrice(symbol)
    });
    
    res.json({ success: true, message: `${amount} ${symbol} envoyé à ${user.username}` });
});

// Modifier le solde d'une crypto pour un utilisateur (admin)
app.post('/api/admin/update-balance', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, balance } = req.body;
    
    if (!userId || !symbol || balance === undefined || balance < 0) {
        return res.status(400).json({ success: false, error: 'Données invalides' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const asset = user.assets.find(a => a.symbol === symbol);
    if (!asset) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    // Modifier le solde
    asset.balance = balance;
    asset.usdValue = balance * getCryptoPrice(symbol);
    
    res.json({ success: true, message: `Solde ${symbol} mis à jour pour ${user.username}` });
});

// Supprimer un utilisateur (admin)
app.delete('/api/admin/delete-user', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId } = req.body;
    const index = users.findIndex(u => u.id === userId);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    users.splice(index, 1);
    res.json({ success: true, message: 'Utilisateur supprimé' });
});

// ==================== FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
    console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}`);
});