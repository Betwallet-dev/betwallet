const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ==================== POSTGRESQL CONNEXION ====================
const pool = new Pool({
    connectionString: 'postgresql://betwallet_db_user:jRGeaMIS9unWbiCbg7WvvAbMOYlHWVJZ@dpg-d7s8e71o3t8c73dlbtg0-a/betwallet_db',
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        // Table users
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                wallet_address TEXT UNIQUE NOT NULL,
                assets JSONB DEFAULT '[]',
                transactions JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Vérifier/créer admin
        const adminCheck = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@betwallet.com']);
        if (adminCheck.rows.length === 0) {
            const defaultAssets = [
                { symbol: 'BTC', name: 'Bitcoin', balance: 0, usdValue: 0, address: 'btc_address_here' },
                { symbol: 'ETH', name: 'Ethereum', balance: 0, usdValue: 0, address: 'eth_address_here' },
                { symbol: 'BNB', name: 'BNB Smart Chain', balance: 0, usdValue: 0, address: 'bnb_address_here' },
                { symbol: 'SOL', name: 'Solana', balance: 0, usdValue: 0, address: 'sol_address_here' },
                { symbol: 'USDT', name: 'Tether', balance: 0, usdValue: 0, address: 'usdt_address_here' },
                { symbol: 'XRP', name: 'Ripple', balance: 0, usdValue: 0, address: 'xrp_address_here' },
                { symbol: 'ADA', name: 'Cardano', balance: 0, usdValue: 0, address: 'ada_address_here' },
                { symbol: 'DOGE', name: 'Dogecoin', balance: 0, usdValue: 0, address: 'doge_address_here' },
                { symbol: 'MATIC', name: 'Polygon', balance: 0, usdValue: 0, address: 'matic_address_here' },
                { symbol: 'DOT', name: 'Polkadot', balance: 0, usdValue: 0, address: 'dot_address_here' },
                { symbol: 'AVAX', name: 'Avalanche', balance: 0, usdValue: 0, address: 'avax_address_here' },
                { symbol: 'LINK', name: 'Chainlink', balance: 0, usdValue: 0, address: 'link_address_here' }
            ];
            await pool.query(
                'INSERT INTO users (username, email, password, wallet_address, assets) VALUES ($1, $2, $3, $4, $5)',
                ['Administrateur', 'admin@betwallet.com', 'Admin123!', '0xADMIN', JSON.stringify(defaultAssets)]
            );
            console.log('✅ Compte admin créé');
        }
        
        console.log('✅ PostgreSQL connecté');
        return true;
    } catch (error) {
        console.error('❌ Erreur PostgreSQL:', error.message);
        return false;
    }
}

// ==================== PRIX SIMULÉS ====================
function getCurrentPrice(symbol) {
    const prices = {
        'BTC': 57000, 'ETH': 3200, 'BNB': 520, 'SOL': 140, 'USDT': 1,
        'XRP': 0.5, 'ADA': 0.3, 'DOGE': 0.08, 'MATIC': 0.5, 'DOT': 6, 'AVAX': 35, 'LINK': 14
    };
    return prices[symbol] || 0;
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
        'XRP': '💎', 'ADA': '🔷', 'DOGE': '🐕', 'MATIC': '🔺', 'DOT': '⛓️',
        'AVAX': '❄️', 'LINK': '🔗'
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
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
        }
        
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }
        
        const nextId = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM users');
        const userId = nextId.rows[0].next_id;
        const walletAddress = generateWalletAddress();
        
        const assets = ALL_CRYPTOS.map(symbol => ({
            symbol: symbol,
            name: getCryptoName(symbol),
            balance: 0,
            usdValue: 0,
            address: generateCryptoAddress(symbol)
        }));
        
        await pool.query(
            'INSERT INTO users (id, username, email, password, wallet_address, assets) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, username, email, password, walletAddress, JSON.stringify(assets)]
        );
        
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

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
        
        if (user.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }
        
        const token = `token_${user.rows[0].id}_${Date.now()}`;
        res.json({
            success: true,
            token,
            user: {
                id: user.rows[0].id,
                username: user.rows[0].username,
                email: user.rows[0].email,
                walletAddress: user.rows[0].wallet_address
            }
        });
    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// MOT DE PASSE OUBLIÉ
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
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
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (user.rows.length === 0) return res.status(401).json({ success: false });
    
    const assets = JSON.parse(user.rows[0].assets);
    let totalBalance = 0;
    const assetsWithPrices = assets.map(asset => {
        const price = getCurrentPrice(asset.symbol);
        const usdValue = asset.balance * price;
        totalBalance += usdValue;
        return { ...asset, usdValue, icon: getCryptoIcon(asset.symbol), currentPrice: price };
    });
    
    res.json({
        success: true,
        dashboard: {
            totalBalance,
            assets: assetsWithPrices,
            transactions: JSON.parse(user.rows[0].transactions || '[]')
        }
    });
});

// ADRESSE CRYPTO
app.get('/api/wallet/address/:symbol', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    
    const userId = parseInt(token.split('_')[1]);
    const user = await pool.query('SELECT assets FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(401).json({ success: false });
    
    const assets = JSON.parse(user.rows[0].assets);
    const asset = assets.find(a => a.symbol === req.params.symbol);
    if (!asset) return res.status(404).json({ success: false });
    
    res.json({ success: true, address: asset.address });
});

// ENVOYER TRANSACTION
app.post('/api/wallet/send', async (req, res) => {
    const { to, amount, symbol } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    
    const userId = parseInt(token.split('_')[1]);
    const user = await pool.query('SELECT assets, transactions FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(401).json({ success: false });
    
    let assets = JSON.parse(user.rows[0].assets);
    let transactions = JSON.parse(user.rows[0].transactions || '[]');
    
    const assetIndex = assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1 || assets[assetIndex].balance < amount) {
        return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    assets[assetIndex].balance -= amount;
    transactions.unshift({
        type: 'send',
        symbol: symbol,
        amount: amount,
        to: to,
        date: new Date().toISOString()
    });
    
    await pool.query(
        'UPDATE users SET assets = $1, transactions = $2 WHERE id = $3',
        [JSON.stringify(assets), JSON.stringify(transactions), userId]
    );
    
    res.json({ success: true, message: `${amount} ${symbol} envoyé` });
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

app.get('/api/admin/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const users = await pool.query('SELECT id, username, email, wallet_address, assets, transactions, created_at FROM users');
    const usersWithValues = users.rows.map(u => {
        const assets = JSON.parse(u.assets);
        return {
            id: u.id,
            username: u.username,
            email: u.email,
            walletAddress: u.wallet_address,
            assets: assets.map(a => ({ ...a, currentPrice: getCurrentPrice(a.symbol) })),
            totalValue: assets.reduce((s, a) => s + a.balance * getCurrentPrice(a.symbol), 0),
            transactions: JSON.parse(u.transactions || '[]'),
            created_at: u.created_at
        };
    });
    res.json({ success: true, users: usersWithValues });
});

app.post('/api/admin/send-crypto', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, amount } = req.body;
    const user = await pool.query('SELECT assets, transactions, username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ success: false });
    
    let assets = JSON.parse(user.rows[0].assets);
    let transactions = JSON.parse(user.rows[0].transactions || '[]');
    
    const assetIndex = assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    
    assets[assetIndex].balance += amount;
    transactions.unshift({
        type: 'receive',
        symbol: symbol,
        amount: amount,
        from: 'Admin',
        date: new Date().toISOString()
    });
    
    await pool.query(
        'UPDATE users SET assets = $1, transactions = $2 WHERE id = $3',
        [JSON.stringify(assets), JSON.stringify(transactions), userId]
    );
    
    res.json({ success: true, message: `${amount} ${symbol} envoyé à ${user.rows[0].username}` });
});

app.post('/api/admin/update-balance', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, balance } = req.body;
    const user = await pool.query('SELECT assets FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ success: false });
    
    let assets = JSON.parse(user.rows[0].assets);
    const assetIndex = assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    
    assets[assetIndex].balance = balance;
    await pool.query('UPDATE users SET assets = $1 WHERE id = $2', [JSON.stringify(assets), userId]);
    res.json({ success: true, message: `Solde ${symbol} mis à jour` });
});

app.post('/api/admin/update-address', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId, symbol, newAddress } = req.body;
    const user = await pool.query('SELECT assets FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ success: false });
    
    let assets = JSON.parse(user.rows[0].assets);
    const assetIndex = assets.findIndex(a => a.symbol === symbol);
    if (assetIndex === -1) return res.status(404).json({ success: false });
    
    assets[assetIndex].address = newAddress;
    await pool.query('UPDATE users SET assets = $1 WHERE id = $2', [JSON.stringify(assets), userId]);
    res.json({ success: true, message: `Adresse ${symbol} mise à jour` });
});

app.delete('/api/admin/delete-user', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== 'admin_secret_token') return res.status(401).json({ success: false });
    
    const { userId } = req.body;
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
});

// ==================== FRONTEND ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));
app.get('/coin-detail.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'coin-detail.html')));

// ==================== DÉMARRAGE ====================
async function startServer() {
    const dbInit = await initDB();
    if (!dbInit) {
        console.log('❌ Base de données non disponible');
        process.exit(1);
    }
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
        console.log(`🔐 Admin: ${adminEmail} / ${adminPassword}`);
        console.log(`🐘 PostgreSQL connecté (données persistantes)\n`);
    });
}

startServer();