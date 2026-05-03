const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Stockage persistant
const DATA_FILE = path.join(__dirname, 'users.json');
let users = [];
let nextId = 1;

if (fs.existsSync(DATA_FILE)) {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const saved = JSON.parse(data);
        users = saved.users || [];
        nextId = saved.nextId || users.length + 1;
        console.log(`✅ ${users.length} utilisateurs chargés`);
    } catch(e) { console.error('Erreur chargement:', e); }
}

function saveUsers() {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users, nextId }, null, 2));
    console.log(`💾 ${users.length} utilisateurs sauvegardés`);
}

// ==================== PRIX TEMPS RÉEL ====================
async function getRealTimePrice(symbol) {
    try {
        const mapping = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'BNB': 'binancecoin',
            'SOL': 'solana',
            'USDT': 'tether'
        };
        
        const id = mapping[symbol];
        if (!id) return 0;
        
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        const data = await response.json();
        return data[id]?.usd || 0;
    } catch (error) {
        console.error(`Erreur prix ${symbol}:`, error);
        const defaults = { BTC: 57000, ETH: 3200, BNB: 520, SOL: 140, USDT: 1 };
        return defaults[symbol] || 0;
    }
}

async function updateUserPrices(user) {
    for (const asset of user.assets) {
        const price = await getRealTimePrice(asset.symbol);
        asset.usdValue = asset.balance * price;
    }
}

// ==================== UTILITAIRES ====================
const adminEmail = 'admin@betwallet.com';
const adminPassword = 'Admin123!';
const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'USDT'];

function generateWalletAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

function getCryptoName(symbol) {
    const names = { BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB Smart Chain', SOL: 'Solana', USDT: 'Tether' };
    return names[symbol] || symbol;
}

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
});

// Inscription - SOLDE ZÉRO
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
    }
    
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
    }
    
    const userId = nextId++;
    const walletAddress = generateWalletAddress();
    
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
    
    saveUsers();
    
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
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress } });
});

// Dashboard avec prix temps réel
app.get('/api/wallet/dashboard', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    
    const userId = parseInt(token.split('_')[1]);
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ success: false });
    
    await updateUserPrices(user);
    saveUsers();
    
    const totalBalance = user.assets.reduce((sum, a) => sum + (a.usdValue || 0), 0);
    const icons = { BTC: '₿', ETH: 'Ξ', BNB: '🔶', SOL: '◎', USDT: '💵' };
    
    // Récupérer les prix individuels
    const prices = {};
    for (const symbol of cryptoSymbols) {
        prices[symbol] = await getRealTimePrice(symbol);
    }
    
    res.json({
        success: true,
        dashboard: {
            totalBalance: totalBalance,
            assets: user.assets.map(a => ({ 
                ...a, 
                name: getCryptoName(a.symbol), 
                icon: icons[a.symbol] || '💰',
                currentPrice: prices[a.symbol]
            })),
            transactions: user.transactions || []
        }
    });
});

app.post('/api/wallet/send', async (req, res) => {
    const { to, amount, symbol } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    
    const userId = parseInt(token.split('_')[1]);
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ success: false });
    
    const asset = user.assets.find(a => a.symbol === symbol);
    if (!asset || asset.balance < amount) {
        return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    const price = await getRealTimePrice(symbol);
    
    asset.balance -= amount;
    asset.usdValue = asset.balance * price;
    user.transactions.unshift({
        type: 'send',
        symbol, amount, to,
        date: new Date().toISOString(),
        usdValue: amount * price
    });
    saveUsers();
    
    res.json({ success: true, message: 'Transaction envoyée' });
});

// ==================== ROUTES ADMIN ====================
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === adminEmail && password === adminPassword) {
        res.json({ success: true, token: 'admin_secret_token' });
    } else {
        res.status(401).json({ success: false });
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

app.get('/api/admin/users', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    res.json({ success: true, users: users.map(u => ({ ...u, password: undefined })) });
});

app.post('/api/admin/send-crypto', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, amount } = req.body;
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ success: false });
    
    const asset = user.assets.find(a => a.symbol === symbol);
    if (!asset) return res.status(404).json({ success: false });
    
    const price = await getRealTimePrice(symbol);
    
    asset.balance += amount;
    asset.usdValue = asset.balance * price;
    user.transactions.unshift({
        type: 'receive',
        symbol, amount, from: 'Admin',
        date: new Date().toISOString(),
        usdValue: amount * price
    });
    saveUsers();
    
    res.json({ success: true, message: `${amount} ${symbol} envoyé (${price}$/unité)`, price: price });
});

app.post('/api/admin/update-balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, balance } = req.body;
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ success: false });
    
    const asset = user.assets.find(a => a.symbol === symbol);
    if (!asset) return res.status(404).json({ success: false });
    
    const price = await getRealTimePrice(symbol);
    
    asset.balance = balance;
    asset.usdValue = balance * price;
    saveUsers();
    
    res.json({ success: true, message: `Solde ${symbol} mis à jour (${price}$/unité)`, price: price });
});

app.delete('/api/admin/delete-user', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId } = req.body;
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return res.status(404).json({ success: false });
    
    users.splice(index, 1);
    saveUsers();
    res.json({ success: true });
});

// Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API sur port ${PORT}`);
    console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}`);
});