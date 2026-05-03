const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Stockage temporaire (simule une base de données)
const users = [];

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running', timestamp: new Date().toISOString() });
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
    const walletAddress = `0x${Math.random().toString(36).substring(2, 15)}${Date.now()}`;
    
    users.push({ id: userId, username, email, password, walletAddress });
    
    const token = `fake_token_${userId}_${Date.now()}`;
    
    console.log(`📝 Nouvel utilisateur: ${username} (${email})`);
    
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
    
    const token = `fake_token_${user.id}_${Date.now()}`;
    
    res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress }
    });
});

// Dashboard (données simulées style Trust Wallet)
app.get('/api/wallet/dashboard', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    // Données simulées comme Trust Wallet
    res.json({
        success: true,
        dashboard: {
            totalBalance: 7150,
            assets: [
                { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850, icon: '₿' },
                { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400, icon: 'Ξ' },
                { symbol: 'SOL', name: 'Solana', balance: 10, usdValue: 1400, icon: '◎' },
                { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500, icon: '💵' }
            ],
            chartData: {
                labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
                values: [6800, 6900, 7000, 7100, 7050, 7150, 7150]
            }
        }
    });
});

// Route balances (pour compatibilité)
app.get('/api/wallet/balances', (req, res) => {
    res.json({
        success: true,
        balances: {
            bitcoin: 0.05,
            ethereum: 0.8,
            solana: 10,
            usdt: 500
        }
    });
});

// Route seed (retourne une seed fictive)
app.get('/api/wallet/seed', (req, res) => {
    res.json({ success: true, seedPhrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon' });
});

// Route address
app.get('/api/wallet/address/:symbol', (req, res) => {
    const { symbol } = req.params;
    res.json({ 
        success: true, 
        address: `0x${Math.random().toString(36).substring(2, 15)}${Date.now()}`
    });
});

// Envoi de transaction
app.post('/api/wallet/send', (req, res) => {
    const { to, amount, symbol } = req.body;
    console.log(`💰 Transaction: ${amount} ${symbol} vers ${to}`);
    res.json({
        success: true,
        message: `Transaction de ${amount} ${symbol} vers ${to} simulée`,
        txHash: `0x${Math.random().toString(36).substring(2, 15)}`
    });
});

// Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Démarrer
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
    console.log(`📋 Routes disponibles:`);
    console.log(`   POST /api/auth/register`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/wallet/dashboard`);
    console.log(`   GET  /api/wallet/balances`);
    console.log(`   GET  /api/wallet/seed`);
    console.log(`   GET  /api/wallet/address/:symbol`);
    console.log(`   POST /api/wallet/send`);
});