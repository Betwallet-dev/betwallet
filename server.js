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
// IMPORTANT: Remplacez par votre chaîne MongoDB
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
        
        // Créer un index unique sur email
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        
        const count = await usersCollection.countDocuments();
        console.log(`✅ MongoDB connecté - ${count} utilisateurs dans la base`);
        return true;
    } catch (error) {
        console.error('❌ Erreur MongoDB:', error.message);
        return false;
    }
}

// ==================== UTILITAIRES ====================
const adminEmail = 'admin@betwallet.com';
const adminPassword = 'Admin123!';

const ALL_CRYPTOS = ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'XRP', 'ADA', 'DOGE', 'MATIC', 'DOT', 'AVAX', 'LINK'];

function getCryptoName(symbol) {
    const names = { 'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'BNB': 'BNB Smart Chain', 'SOL': 'Solana', 'USDT': 'Tether', 'XRP': 'Ripple', 'ADA': 'Cardano', 'DOGE': 'Dogecoin', 'MATIC': 'Polygon', 'DOT': 'Polkadot', 'AVAX': 'Avalanche', 'LINK': 'Chainlink' };
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
        
        const existing = await usersCollection.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        
        const userId = await getNextId();
        const walletAddress = generateWalletAddress();
        
        const assets = ALL_CRYPTOS.map(symbol => ({
            symbol, name: getCryptoName(symbol), balance: 0, usdValue: 0, address: generateCryptoAddress(symbol)
        }));
        
        const newUser = {
            id: userId, username, email, password, walletAddress, assets, transactions: [], created_at: new Date().toISOString()
        };
        
        await usersCollection.insertOne(newUser);
        
        const token = `token_${userId}_${Date.now()}`;
        res.json({ success: true, token, user: { id: userId, username, email, walletAddress } });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email, password });
        
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
    const user = await usersCollection.findOne({ email });
    if (!user) {
        return res.json({ success: true, message: 'Si cet email existe, vous recevrez un lien.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, resetToken });
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
    
    let totalBalance = 0;
    const assetsWithPrices = user.assets.map(asset => {
        const usdValue = asset.balance * 57000;
        totalBalance += usdValue;
        return { ...asset, usdValue, icon: getCryptoIcon(asset.symbol), currentPrice: 57000 };
    });
    
    res.json({ success: true, dashboard: { totalBalance, assets: assetsWithPrices, transactions: user.transactions || [] } });
});

// ADRESSE CRYPTO
app.get('/api/wallet/address/:symbol', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    
    const userId = parseInt(token.split('_')[1]);
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(401).json({ success: false });
    
    const asset = user.assets.find(a => a.symbol === req.params.symbol);
    if (!asset) return res.status(404).json({ success: false });
    
    res.json({ success: true, address: asset.address });
});

// ENVOYER
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
    
    user.assets[assetIndex].balance -= amount;
    user.transactions.unshift({ type: 'send', symbol, amount, to, date: new Date().toISOString() });
    
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets, transactions: user.transactions } });
    res.json({ success: true, message: `${amount} ${symbol} envoyé` });
});

// ==================== ADMIN ====================
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

app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const users = await usersCollection.find({}).toArray();
    const usersWithValues = users.map(u => ({
        id: u.id, username: u.username, email: u.email, walletAddress: u.walletAddress,
        assets: u.assets.map(a => ({ ...a, currentPrice: 57000 })),
        totalValue: u.assets.reduce((s, a) => s + a.balance * 57000, 0),
        transactions: u.transactions, created_at: u.created_at
    }));
    res.json({ success: true, users: usersWithValues });
});

app.post('/api/admin/send-crypto', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, amount } = req.body;
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(404).json({ success: false });
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    
    user.assets[assetIndex].balance += amount;
    user.transactions.unshift({ type: 'receive', symbol, amount, from: 'Admin', date: new Date().toISOString() });
    
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets, transactions: user.transactions } });
    res.json({ success: true, message: `${amount} ${symbol} envoyé` });
});

app.post('/api/admin/update-balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, balance } = req.body;
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(404).json({ success: false });
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    
    user.assets[assetIndex].balance = balance;
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets } });
    res.json({ success: true });
});

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

// ==================== FRONTEND ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));
app.get('/coin-detail.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'coin-detail.html')));

// ==================== DÉMARRAGE ====================
async function startServer() {
    const dbConnected = await connectDB();
    if (!dbConnected) {
        console.log('⚠️ MongoDB non connecté, arrêt du serveur');
        process.exit(1);
    }
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
        console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}`);
        console.log(`🍃 MongoDB connecté (données persistantes)\n`);
    });
}

startServer();