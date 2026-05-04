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

// ==================== STOCKAGE PERSISTANT ====================
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Dossier créé: ${DATA_DIR}`);
}

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            const saved = JSON.parse(data);
            console.log(`✅ ${saved.users?.length || 0} utilisateurs chargés`);
            return {
                users: saved.users || [],
                nextId: saved.nextId || 1
            };
        } else {
            return { users: [], nextId: 1 };
        }
    } catch (e) {
        console.error('Erreur chargement:', e);
        return { users: [], nextId: 1 };
    }
}

function saveUsers(usersData, nextIdData) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: usersData, nextId: nextIdData }, null, 2));
        console.log(`💾 ${usersData.length} utilisateurs sauvegardés`);
        return true;
    } catch (e) {
        console.error('Erreur sauvegarde:', e);
        return false;
    }
}

let { users, nextId } = loadUsers();

// ==================== PRIX TEMPS RÉEL ====================
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
    const names = {
        'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'BNB': 'BNB Smart Chain', 'SOL': 'Solana',
        'USDT': 'Tether', 'XRP': 'Ripple', 'ADA': 'Cardano', 'DOGE': 'Dogecoin',
        'MATIC': 'Polygon', 'DOT': 'Polkadot', 'AVAX': 'Avalanche', 'LINK': 'Chainlink'
    };
    return names[symbol] || symbol;
}

function getCryptoIcon(symbol) {
    const icons = {
        'BTC': '₿', 'ETH': 'Ξ', 'BNB': '🔶', 'SOL': '◎', 'USDT': '💵',
        'XRP': '💎', 'ADA': '🔷', 'DOGE': '🐕', 'MATIC': '🔺', 'DOT': '⛓️', 'AVAX': '❄️', 'LINK': '🔗'
    };
    return icons[symbol] || '💰';
}

function generateWalletAddress() {
    return `0x${crypto.randomBytes(20).toString('hex')}`;
}

function generateCryptoAddress(symbol) {
    return `${symbol.toLowerCase()}_${crypto.randomBytes(16).toString('hex')}`;
}

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// INSCRIPTION
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
    
    const assets = ALL_CRYPTOS.map(symbol => ({
        symbol: symbol,
        name: getCryptoName(symbol),
        balance: 0,
        usdValue: 0,
        address: generateCryptoAddress(symbol)
    }));
    
    const newUser = {
        id: userId,
        username,
        email,
        password,
        walletAddress,
        assets: assets,
        transactions: [],
        created_at: new Date().toISOString()
    };
    
    users.push(newUser);
    saveUsers(users, nextId);
    
    const token = `token_${userId}_${Date.now()}`;
    
    res.json({
        success: true,
        token,
        user: { id: userId, username, email, walletAddress }
    });
});

// CONNEXION
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
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            walletAddress: user.walletAddress
        }
    });
});

// MOT DE PASSE OUBLIÉ
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

// DASHBOARD
app.get('/api/wallet/dashboard', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const userId = parseInt(token.split('_')[1]);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const prices = await getAllPrices();
    let totalBalance = 0;
    
    const assetsWithPrices = user.assets.map(asset => {
        const currentPrice = prices[asset.symbol] || DEFAULT_PRICES[asset.symbol] || 0;
        const usdValue = asset.balance * currentPrice;
        totalBalance += usdValue;
        
        return {
            symbol: asset.symbol,
            name: getCryptoName(asset.symbol),
            balance: asset.balance,
            usdValue: usdValue,
            icon: getCryptoIcon(asset.symbol),
            currentPrice: currentPrice,
            address: asset.address
        };
    });
    
    res.json({
        success: true,
        dashboard: {
            totalBalance: totalBalance,
            assets: assetsWithPrices,
            transactions: user.transactions || []
        }
    });
});

// Récupérer l'adresse d'une crypto pour un utilisateur
app.get('/api/wallet/address/:symbol', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const userId = parseInt(token.split('_')[1]);
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const { symbol } = req.params;
    const asset = user.assets.find(a => a.symbol === symbol);
    
    if (!asset) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    res.json({
        success: true,
        address: asset.address || `Adresse ${symbol} non disponible`
    });
});

// ENVOYER TRANSACTION (utilisateur)
app.post('/api/wallet/send', async (req, res) => {
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
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1 || user.assets[assetIndex].balance < amount) {
        return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    const price = await getPrice(symbol);
    const usdValue = amount * price;
    
    user.assets[assetIndex].balance -= amount;
    
    user.transactions.unshift({
        type: 'send',
        symbol: symbol,
        amount: amount,
        to: to,
        usdValue: usdValue,
        priceAtTime: price,
        date: new Date().toISOString(),
        status: 'completed'
    });
    
    saveUsers(users, nextId);
    
    res.json({
        success: true,
        message: `${amount} ${symbol} envoyé`,
        usdValue: usdValue,
        priceAtTime: price
    });
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
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const prices = await getAllPrices();
    
    const usersWithValues = users.map(u => {
        let totalValue = 0;
        const assetsWithValue = u.assets.map(asset => {
            const price = prices[asset.symbol] || DEFAULT_PRICES[asset.symbol] || 0;
            const value = asset.balance * price;
            totalValue += value;
            return {
                symbol: asset.symbol,
                name: getCryptoName(asset.symbol),
                balance: asset.balance,
                usdValue: value,
                currentPrice: price,
                address: asset.address
            };
        });
        
        return {
            id: u.id,
            username: u.username,
            email: u.email,
            walletAddress: u.walletAddress,
            assets: assetsWithValue,
            totalValue: totalValue,
            transactions: u.transactions,
            created_at: u.created_at
        };
    });
    
    res.json({ success: true, users: usersWithValues });
});

// ADMIN - ENVOYER DES CRYPTOS
app.post('/api/admin/send-crypto', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, amount } = req.body;
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
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
    
    saveUsers(users, nextId);
    
    res.json({
        success: true,
        message: `${amount} ${symbol} envoyé à ${user.username}`,
        marketPrice: currentMarketPrice,
        usdValueAdded: usdValueAdded,
        newBalance: user.assets[assetIndex].balance
    });
});

// ADMIN - MODIFIER LE SOLDE
app.post('/api/admin/update-balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, balance } = req.body;
    const user = users.find(u => u.id === userId);
    
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    const currentPrice = await getPrice(symbol);
    user.assets[assetIndex].balance = balance;
    user.assets[assetIndex].usdValue = balance * currentPrice;
    
    saveUsers(users, nextId);
    
    res.json({
        success: true,
        message: `Solde ${symbol} de ${user.username} mis à jour`,
        newBalance: balance,
        newUsdValue: balance * currentPrice
    });
});

// ADMIN - MODIFIER L'ADRESSE D'UNE CRYPTO (BTC, ETH, etc.)
app.post('/api/admin/update-address', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, newAddress } = req.body;
    
    if (!userId || !symbol || !newAddress) {
        return res.status(400).json({ success: false, error: 'Données invalides' });
    }
    
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const assetIndex = user.assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) {
        return res.status(404).json({ success: false, error: `Crypto ${symbol} non trouvée` });
    }
    
    // Modifier l'adresse
    user.assets[assetIndex].address = newAddress;
    
    saveUsers(users, nextId);
    
    res.json({
        success: true,
        message: `Adresse ${symbol} mise à jour pour ${user.username}`,
        newAddress: newAddress,
        symbol: symbol
    });
});

// ADMIN - SUPPRIMER UN UTILISATEUR
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
    saveUsers(users, nextId);
    
    res.json({ success: true, message: 'Utilisateur supprimé' });
});

app.get('/api/prices', async (req, res) => {
    const prices = await getAllPrices();
    res.json({ success: true, prices: prices });
});

// ==================== FRONTEND ====================
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

// ==================== DÉMARRAGE ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
    console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}`);
    console.log(`📁 Dossier données: ${DATA_DIR}`);
    console.log(`👥 ${users.length} utilisateurs chargés\n`);
});