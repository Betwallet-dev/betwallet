const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== MONGODB ====================
const MONGODB_URI = 'mongodb+srv://betwallet_user:BetWallet2024@cluster0.i7d5ua6.mongodb.net/?appName=Cluster0';
const DB_NAME = 'betwallet';

let db;
let usersCollection;

async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        console.log('✅ MongoDB connecté');
    } catch (error) {
        console.error('❌ MongoDB error:', error);
        process.exit(1);
    }
}

// ==================== PRIX ====================
const CRYPTO_IDS = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin', 'SOL': 'solana',
    'USDT': 'tether', 'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin',
    'MATIC': 'polygon', 'DOT': 'polkadot', 'AVAX': 'avalanche-2', 'LINK': 'chainlink'
};

const DEFAULT_PRICES = {
    'BTC': 57000, 'ETH': 3200, 'BNB': 520, 'SOL': 140, 'USDT': 1,
    'XRP': 0.5, 'ADA': 0.3, 'DOGE': 0.08, 'MATIC': 0.5, 'DOT': 6, 'AVAX': 35, 'LINK': 14
};

async function getAllPrices() {
    try {
        const ids = Object.values(CRYPTO_IDS).join(',');
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        if (!response.ok) return DEFAULT_PRICES;
        const data = await response.json();
        const prices = {};
        for (const [symbol, id] of Object.entries(CRYPTO_IDS)) {
            prices[symbol] = data[id]?.usd || DEFAULT_PRICES[symbol];
        }
        return prices;
    } catch (error) {
        return DEFAULT_PRICES;
    }
}

async function getPrice(symbol) {
    try {
        const id = CRYPTO_IDS[symbol];
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        if (!response.ok) return DEFAULT_PRICES[symbol] || 0;
        const data = await response.json();
        return data[id]?.usd || DEFAULT_PRICES[symbol] || 0;
    } catch (error) {
        return DEFAULT_PRICES[symbol] || 0;
    }
}

// ==================== UTILITAIRES ====================
const adminEmail = 'admin@betwallet.com';
const adminPassword = 'Admin123!';

const ALL_CRYPTOS = ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'XRP', 'ADA', 'DOGE', 'MATIC', 'DOT', 'AVAX', 'LINK'];

function getCryptoName(symbol) {
    const names = { 'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'BNB': 'BNB', 'SOL': 'Solana', 'USDT': 'Tether', 'XRP': 'Ripple', 'ADA': 'Cardano', 'DOGE': 'Dogecoin', 'MATIC': 'Polygon', 'DOT': 'Polkadot', 'AVAX': 'Avalanche', 'LINK': 'Chainlink' };
    return names[symbol] || symbol;
}

function getCryptoIcon(symbol) {
    const icons = { 'BTC': '₿', 'ETH': 'Ξ', 'BNB': '🔶', 'SOL': '◎', 'USDT': '💵', 'XRP': '💎', 'ADA': '🔷', 'DOGE': '🐕', 'MATIC': '🔺', 'DOT': '⛓️', 'AVAX': '❄️', 'LINK': '🔗' };
    return icons[symbol] || '💰';
}

function generateWalletAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

function generateCryptoAddress(symbol) {
    return `${symbol.toLowerCase()}_${crypto.randomBytes(16).toString('hex')}`;
}

async function getNextId() {
    const lastUser = await usersCollection.findOne({}, { sort: { id: -1 } });
    return lastUser ? lastUser.id + 1 : 1;
}

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
});

// INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        const existing = await usersCollection.findOne({ email: email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        const userId = await getNextId();
        const walletAddress = generateWalletAddress();
        const assets = ALL_CRYPTOS.map(symbol => ({
            symbol: symbol, name: getCryptoName(symbol), balance: 0, usdValue: 0, address: generateCryptoAddress(symbol)
        }));
        const newUser = { id: userId, username, email, password, walletAddress, assets, transactions: [], created_at: new Date().toISOString() };
        await usersCollection.insertOne(newUser);
        const token = `token_${userId}_${Date.now()}`;
        res.json({ success: true, token, user: { id: userId, username, email, walletAddress } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email: email, password: password });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        const token = `token_${user.id}_${Date.now()}`;
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// MOT DE PASSE OUBLIÉ
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await usersCollection.findOne({ email: email });
    if (!user) return res.json({ success: true, message: 'Si cet email existe, vous recevrez un lien.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, resetToken: resetToken });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Mot de passe trop court' });
    }
    res.json({ success: true, message: 'Mot de passe réinitialisé' });
});

// DASHBOARD
app.get('/api/wallet/dashboard', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    const userId = parseInt(token.split('_')[1]);
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(401).json({ success: false });
    const prices = await getAllPrices();
    let totalBalance = 0;
    const assetsWithPrices = user.assets.map(asset => {
        const currentPrice = prices[asset.symbol] || DEFAULT_PRICES[asset.symbol] || 0;
        const usdValue = asset.balance * currentPrice;
        totalBalance += usdValue;
        return { symbol: asset.symbol, name: getCryptoName(asset.symbol), balance: asset.balance, usdValue: usdValue, icon: getCryptoIcon(asset.symbol), currentPrice: currentPrice, address: asset.address };
    });
    res.json({ success: true, dashboard: { totalBalance: totalBalance, assets: assetsWithPrices, transactions: user.transactions || [] } });
});

// ENVOYER TRANSACTION (utilisateur)
app.post('/api/wallet/send', async (req, res) => {
    const { to, amount, symbol } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    const userId = parseInt(token.split('_')[1]);
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(401).json({ success: false });
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1 || user.assets[assetIndex].balance < amount) {
        return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    const price = await getPrice(symbol);
    const usdValue = amount * price;
    user.assets[assetIndex].balance -= amount;
    user.transactions.unshift({ type: 'send', symbol, amount, to, usdValue, priceAtTime: price, date: new Date().toISOString(), status: 'completed' });
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets, transactions: user.transactions } });
    res.json({ success: true, message: `${amount} ${symbol} envoyé`, usdValue, priceAtTime: price });
});

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

app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    const freshUsers = await usersCollection.find({}).toArray();
    const prices = await getAllPrices();
    const usersWithValues = freshUsers.map(u => {
        let totalValue = 0;
        const assetsWithValue = u.assets.map(asset => {
            const price = prices[asset.symbol] || DEFAULT_PRICES[asset.symbol] || 0;
            const value = asset.balance * price;
            totalValue += value;
            return { symbol: asset.symbol, name: getCryptoName(asset.symbol), balance: asset.balance, usdValue: value, currentPrice: price, address: asset.address };
        });
        return { id: u.id, username: u.username, email: u.email, walletAddress: u.walletAddress, assets: assetsWithValue, totalValue, transactions: u.transactions, created_at: u.created_at };
    });
    res.json({ success: true, users: usersWithValues });
});

// 🔥 ROUTE ENVOI ADMIN CORRIGÉE - PRIX RÉEL
app.post('/api/admin/send-crypto', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, amount } = req.body;
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    
    // PRIX RÉEL DU MARCHÉ AU MOMENT DE L'ENVOI
    const currentMarketPrice = await getPrice(symbol);
    const usdValueAdded = amount * currentMarketPrice;
    
    user.assets[assetIndex].balance += amount;
    user.assets[assetIndex].usdValue = user.assets[assetIndex].balance * currentMarketPrice;
    
    user.transactions.unshift({
        type: 'receive',
        symbol: symbol,
        amount: amount,
        from: 'Admin',
        usdValue: usdValueAdded,
        priceAtTime: currentMarketPrice,
        date: new Date().toISOString(),
        status: 'completed'
    });
    
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets, transactions: user.transactions } });
    
    res.json({
        success: true,
        message: `${amount} ${symbol} envoyé à ${user.username}`,
        marketPrice: currentMarketPrice,
        usdValueAdded: usdValueAdded,
        newBalance: user.assets[assetIndex].balance,
        newUsdValue: user.assets[assetIndex].usdValue
    });
});

// MODIFIER SOLDE ADMIN
app.post('/api/admin/update-balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    const { userId, symbol, balance } = req.body;
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(404).json({ success: false });
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    const price = await getPrice(symbol);
    user.assets[assetIndex].balance = balance;
    user.assets[assetIndex].usdValue = balance * price;
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets } });
    res.json({ success: true, message: `Solde ${symbol} mis à jour` });
});

// MODIFIER ADRESSE ADMIN
app.post('/api/admin/update-address', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    const { userId, symbol, newAddress } = req.body;
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(404).json({ success: false });
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    user.assets[assetIndex].address = newAddress;
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets } });
    res.json({ success: true });
});

app.delete('/api/admin/delete-user', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    const { userId } = req.body;
    await usersCollection.deleteOne({ id: userId });
    res.json({ success: true });
});

app.get('/api/prices', async (req, res) => {
    const prices = await getAllPrices();
    res.json({ success: true, prices });
});

// ==================== FRONTEND ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));
app.get('/coin-detail.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'coin-detail.html')));

// ==================== DÉMARRAGE ====================
async function startServer() {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 BetWallet API sur http://0.0.0.0:${PORT}`);
        console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}\n`);
    });
}

startServer();