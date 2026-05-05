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
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        
        const count = await usersCollection.countDocuments();
        console.log(`✅ MongoDB connecté - ${count} utilisateurs`);
        
        const admin = await usersCollection.findOne({ email: 'admin@betwallet.com' });
        if (!admin) {
            await usersCollection.insertOne({
                id: 1,
                username: 'Administrateur',
                email: 'admin@betwallet.com',
                password: 'Admin123!',
                walletAddress: '0xADMIN',
                assets: [],
                transactions: [],
                created_at: new Date().toISOString()
            });
            console.log('✅ Compte admin créé');
        }
        return true;
    } catch (error) {
        console.error('❌ Erreur MongoDB:', error.message);
        return false;
    }
}

// ==================== PRIX EN EUROS (SIMULÉS MAIS RÉALISTES) ====================
const CRYPTO_PRICES_EUR = {
    'BTC': 78500, 'ETH': 3100, 'BNB': 620, 'SOL': 160,
    'USDT': 0.95, 'XRP': 0.55, 'ADA': 0.35, 'DOGE': 0.12,
    'MATIC': 0.55, 'DOT': 7.2, 'AVAX': 38, 'LINK': 15
};

async function getCurrentPriceEUR(symbol) {
    return CRYPTO_PRICES_EUR[symbol] || 0;
}

// ==================== UTILITAIRES ====================
const adminEmail = 'admin@betwallet.com';
const adminPassword = 'Admin123!';

const ALL_CRYPTOS = ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'XRP', 'ADA', 'DOGE', 'MATIC', 'DOT', 'AVAX', 'LINK'];

function getCryptoName(symbol) {
    const names = {
        'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'BNB': 'BNB Smart Chain', 'SOL': 'Solana',
        'USDT': 'Tether', 'XRP': 'Ripple', 'ADA': 'Cardano', 'DOGE': 'Dogecoin',
        'MATIC': 'Polygon', 'DOT': 'Polkadot', 'AVAX': 'Avalanche', 'LINK': 'Chainlink'
    };
    return names[symbol] || symbol;
}

function generateWalletAddress() { return `0x${crypto.randomBytes(20).toString('hex')}`; }
function generateCryptoAddress(symbol) { return `${symbol.toLowerCase()}_${crypto.randomBytes(16).toString('hex')}`; }
async function getNextId() { const lastUser = await usersCollection.findOne({}, { sort: { id: -1 } }); return lastUser ? lastUser.id + 1 : 1; }

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => { res.json({ status: 'OK' }); });

// INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        
        const userId = await getNextId();
        const walletAddress = generateWalletAddress();
        const assets = ALL_CRYPTOS.map(symbol => ({ symbol, name: getCryptoName(symbol), balance: 0, eurValue: 0, address: generateCryptoAddress(symbol) }));
        
        await usersCollection.insertOne({ id: userId, username, email, password, walletAddress, assets, transactions: [], created_at: new Date().toISOString() });
        
        const token = `token_${userId}_${Date.now()}`;
        res.json({ success: true, token, user: { id: userId, username, email, walletAddress } });
    } catch (error) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await usersCollection.findOne({ email, password });
        if (!user) return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        const token = `token_${user.id}_${Date.now()}`;
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress } });
    } catch (error) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.json({ success: true, message: 'Si cet email existe, vous recevrez un lien.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, resetToken });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, error: 'Mot de passe trop court' });
    res.json({ success: true, message: 'Mot de passe réinitialisé' });
});

// DASHBOARD
app.get('/api/wallet/dashboard', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    const userId = parseInt(token.split('_')[1]);
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(401).json({ success: false });
    
    let totalBalanceEUR = 0;
    const assetsWithPrices = await Promise.all(user.assets.map(async (asset) => {
        const price = await getCurrentPriceEUR(asset.symbol);
        const eurValue = asset.balance * price;
        totalBalanceEUR += eurValue;
        return { ...asset, eurValue, currentPriceEUR: price };
    }));
    
    res.json({ success: true, dashboard: { totalBalanceEUR, assets: assetsWithPrices, transactions: user.transactions || [] } });
});

// ADRESSE
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
    if (assetIndex === -1 || user.assets[assetIndex].balance < amount) return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    
    const price = await getCurrentPriceEUR(symbol);
    user.assets[assetIndex].balance -= amount;
    user.transactions = user.transactions || [];
    user.transactions.unshift({ type: 'send', symbol, amount, to, eurValue: amount * price, date: new Date().toISOString() });
    
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets, transactions: user.transactions } });
    res.json({ success: true, message: `${amount} ${symbol} envoyé` });
});

// ==================== ADMIN ====================
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === adminEmail && password === adminPassword) res.json({ success: true, token: 'admin_secret_token' });
    else res.status(401).json({ success: false });
});

app.get('/api/admin/verify', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token === 'admin_secret_token') res.json({ success: true });
    else res.status(401).json({ success: false });
});

app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const users = await usersCollection.find({}).toArray();
    const usersWithValues = await Promise.all(users.map(async (u) => {
        let totalValue = 0;
        const assetsWithValue = await Promise.all(u.assets.map(async (asset) => {
            const price = await getCurrentPriceEUR(asset.symbol);
            const value = asset.balance * price;
            totalValue += value;
            return { ...asset, currentPriceEUR: price };
        }));
        return { id: u.id, username: u.username, email: u.email, walletAddress: u.walletAddress, assets: assetsWithValue, totalValueEUR: totalValue, transactions: u.transactions || [], created_at: u.created_at };
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
    
    const price = await getCurrentPriceEUR(symbol);
    user.assets[assetIndex].balance += amount;
    user.transactions = user.transactions || [];
    user.transactions.unshift({ type: 'receive', symbol, amount, from: 'Admin', eurValue: amount * price, date: new Date().toISOString() });
    
    await usersCollection.updateOne({ id: userId }, { $set: { assets: user.assets, transactions: user.transactions } });
    res.json({ success: true, message: `${amount} ${symbol} envoyé à ${user.username}`, priceEUR: price, valueEUR: amount * price });
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

// ROUTE PRIX (appelée par le frontend)
app.get('/api/prices', async (req, res) => {
    res.json({ success: true, prices: CRYPTO_PRICES_EUR });
});

app.post('/api/auth/change-password', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    const userId = parseInt(token.split('_')[1]);
    const { oldPassword, newPassword } = req.body;
    const user = await usersCollection.findOne({ id: userId });
    if (!user) return res.status(404).json({ success: false });
    if (user.password !== oldPassword) return res.status(400).json({ success: false, error: 'Ancien mot de passe incorrect' });
    await usersCollection.updateOne({ id: userId }, { $set: { password: newPassword } });
    res.json({ success: true, message: 'Mot de passe modifié' });
});

// FRONTEND
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));
app.get('/coin-detail.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'coin-detail.html')));

// DÉMARRAGE
async function startServer() {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
        console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}`);
        console.log(`💰 Prix en Euros (simulés mais réalistes)\n`);
    });
}

startServer();