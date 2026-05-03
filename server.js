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
const DATA_FILE = path.join(__dirname, 'users.json');

// Fonction pour charger les utilisateurs depuis le fichier
function loadUsers() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const saved = JSON.parse(data);
            console.log(`✅ ${saved.users?.length || 0} utilisateurs chargés`);
            return {
                users: saved.users || [],
                nextId: saved.nextId || 1
            };
        }
    } catch (e) {
        console.error('Erreur chargement:', e);
    }
    return { users: [], nextId: 1 };
}

// Fonction pour sauvegarder les utilisateurs
function saveUsers(usersData, nextIdData) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ users: usersData, nextId: nextIdData }, null, 2));
        console.log(`💾 ${usersData.length} utilisateurs sauvegardés`);
        return true;
    } catch (e) {
        console.error('Erreur sauvegarde:', e);
        return false;
    }
}

// Chargement initial
let { users, nextId } = loadUsers();

// Fonction helper pour sauvegarder l'état actuel
function persistUsers() {
    saveUsers(users, nextId);
}

// ==================== PRIX TEMPS RÉEL ====================
const CRYPTO_IDS = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'USDT': 'tether'
};

const DEFAULT_PRICES = {
    'BTC': 57000,
    'ETH': 3200,
    'BNB': 520,
    'SOL': 140,
    'USDT': 1
};

async function getAllPrices() {
    try {
        const ids = Object.values(CRYPTO_IDS).join(',');
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const data = await response.json();
        
        const prices = {};
        for (const [symbol, id] of Object.entries(CRYPTO_IDS)) {
            prices[symbol] = data[id]?.usd || DEFAULT_PRICES[symbol];
        }
        return prices;
    } catch (error) {
        console.error('Erreur récupération prix:', error);
        return DEFAULT_PRICES;
    }
}

async function getPrice(symbol) {
    try {
        const id = CRYPTO_IDS[symbol];
        if (!id) return DEFAULT_PRICES[symbol] || 0;
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        const data = await response.json();
        return data[id]?.usd || DEFAULT_PRICES[symbol] || 0;
    } catch (error) {
        console.error(`Erreur prix ${symbol}:`, error);
        return DEFAULT_PRICES[symbol] || 0;
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
    const names = {
        'BTC': 'Bitcoin',
        'ETH': 'Ethereum',
        'BNB': 'BNB Smart Chain',
        'SOL': 'Solana',
        'USDT': 'Tether'
    };
    return names[symbol] || symbol;
}

const CRYPTO_ICONS = {
    'BTC': '₿',
    'ETH': 'Ξ',
    'BNB': '🔶',
    'SOL': '◎',
    'USDT': '💵'
};

// ==================== ROUTES ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

// Inscription - SOLDE ZÉRO
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
    }
    
    // Recharger les utilisateurs pour éviter les conflits
    const { users: freshUsers, nextId: freshNextId } = loadUsers();
    
    if (freshUsers.find(u => u.email === email)) {
        return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
    }
    
    const userId = freshNextId;
    const walletAddress = generateWalletAddress();
    
    const assets = cryptoSymbols.map(symbol => ({
        symbol: symbol,
        name: getCryptoName(symbol),
        balance: 0,
        usdValue: 0,
        address: `${symbol.toLowerCase()}_${crypto.randomBytes(16).toString('hex')}`
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
    
    freshUsers.push(newUser);
    saveUsers(freshUsers, freshNextId + 1);
    
    // Mettre à jour la variable globale
    users = freshUsers;
    nextId = freshNextId + 1;
    
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
    
    // Recharger les utilisateurs pour avoir les dernières données
    const { users: freshUsers } = loadUsers();
    
    const user = freshUsers.find(u => u.email === email && u.password === password);
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

// Mot de passe oublié
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    const { users: freshUsers } = loadUsers();
    const user = freshUsers.find(u => u.email === email);
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

// DASHBOARD - avec prix temps réel
app.get('/api/wallet/dashboard', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const userId = parseInt(token.split('_')[1]);
    
    // Recharger les utilisateurs pour avoir les dernières données
    const { users: freshUsers } = loadUsers();
    const user = freshUsers.find(u => u.id === userId);
    
    if (!user) {
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    // Mettre à jour les valeurs avec les prix actuels
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
            icon: CRYPTO_ICONS[asset.symbol] || '💰',
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

// Envoyer une transaction (utilisateur)
app.post('/api/wallet/send', async (req, res) => {
    const { to, amount, symbol } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Non autorisé' });
    }
    
    const userId = parseInt(token.split('_')[1]);
    
    // Recharger les utilisateurs
    let { users: freshUsers, nextId: freshNextId } = loadUsers();
    const userIndex = freshUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const user = freshUsers[userIndex];
    const asset = user.assets.find(a => a.symbol === symbol);
    
    if (!asset || asset.balance < amount) {
        return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    const price = await getPrice(symbol);
    const usdValue = amount * price;
    
    asset.balance -= amount;
    
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
    
    // Sauvegarder
    saveUsers(freshUsers, freshNextId);
    users = freshUsers;
    
    res.json({
        success: true,
        message: `${amount} ${symbol} envoyé à ${to}`,
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

// Récupérer tous les utilisateurs (admin)
app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    // Recharger les utilisateurs depuis le fichier
    const { users: freshUsers } = loadUsers();
    const prices = await getAllPrices();
    
    const usersWithValues = freshUsers.map(u => {
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

// Envoyer des cryptos à un utilisateur (admin)
app.post('/api/admin/send-crypto', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, amount } = req.body;
    
    if (!userId || !symbol || !amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Données invalides' });
    }
    
    // Recharger les utilisateurs
    let { users: freshUsers, nextId: freshNextId } = loadUsers();
    const userIndex = freshUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const user = freshUsers[userIndex];
    const asset = user.assets.find(a => a.symbol === symbol);
    
    if (!asset) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    const priceAtTime = await getPrice(symbol);
    const usdValueAdded = amount * priceAtTime;
    
    asset.balance += amount;
    
    user.transactions.unshift({
        type: 'receive',
        symbol: symbol,
        amount: amount,
        from: 'Admin',
        usdValue: usdValueAdded,
        priceAtTime: priceAtTime,
        date: new Date().toISOString(),
        status: 'completed'
    });
    
    // Sauvegarder
    saveUsers(freshUsers, freshNextId);
    users = freshUsers;
    
    res.json({
        success: true,
        message: `${amount} ${symbol} envoyé à ${user.username}`,
        priceAtTime: priceAtTime,
        usdValue: usdValueAdded,
        newBalance: asset.balance,
        newUsdValue: asset.balance * priceAtTime
    });
});

// Modifier le solde d'une crypto (admin)
app.post('/api/admin/update-balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, balance } = req.body;
    
    if (!userId || !symbol || balance === undefined || balance < 0) {
        return res.status(400).json({ success: false, error: 'Données invalides' });
    }
    
    // Recharger les utilisateurs
    let { users: freshUsers, nextId: freshNextId } = loadUsers();
    const userIndex = freshUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const user = freshUsers[userIndex];
    const asset = user.assets.find(a => a.symbol === symbol);
    
    if (!asset) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    const currentPrice = await getPrice(symbol);
    
    asset.balance = balance;
    
    // Sauvegarder
    saveUsers(freshUsers, freshNextId);
    users = freshUsers;
    
    res.json({
        success: true,
        message: `Solde ${symbol} de ${user.username} mis à jour`,
        priceAtTime: currentPrice,
        newBalance: balance,
        newUsdValue: balance * currentPrice
    });
});

// MODIFIER L'ADRESSE D'UNE CRYPTO POUR UN UTILISATEUR (admin)
app.post('/api/admin/update-address', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId, symbol, newAddress } = req.body;
    
    if (!userId || !symbol || !newAddress) {
        return res.status(400).json({ success: false, error: 'Données invalides' });
    }
    
    // Recharger les utilisateurs
    let { users: freshUsers, nextId: freshNextId } = loadUsers();
    const userIndex = freshUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const user = freshUsers[userIndex];
    const asset = user.assets.find(a => a.symbol === symbol);
    
    if (!asset) {
        return res.status(404).json({ success: false, error: 'Crypto non trouvée' });
    }
    
    asset.address = newAddress;
    
    // Sauvegarder
    saveUsers(freshUsers, freshNextId);
    users = freshUsers;
    
    res.json({
        success: true,
        message: `Adresse ${symbol} mise à jour pour ${user.username}`,
        newAddress: newAddress
    });
});

// Supprimer un utilisateur (admin)
app.delete('/api/admin/delete-user', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') {
        return res.status(401).json({ success: false });
    }
    
    const { userId } = req.body;
    
    // Recharger les utilisateurs
    let { users: freshUsers, nextId: freshNextId } = loadUsers();
    const index = freshUsers.findIndex(u => u.id === userId);
    
    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    freshUsers.splice(index, 1);
    
    // Sauvegarder
    saveUsers(freshUsers, freshNextId);
    users = freshUsers;
    
    res.json({ success: true, message: 'Utilisateur supprimé' });
});

// Route pour obtenir les prix en temps réel
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
    console.log(`📁 Fichier de données: ${DATA_FILE}`);
    console.log(`👥 Utilisateurs chargés: ${users.length}\n`);
});