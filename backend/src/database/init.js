const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../../betwallet.db');
const db = new sqlite3.Database(dbPath);

console.log('📦 Initialisation de la base de données BetWallet...');

db.serialize(() => {
    // 1. Table des utilisateurs
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        email_verified BOOLEAN DEFAULT 0,
        twofa_enabled BOOLEAN DEFAULT 0,
        twofa_secret TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT 1
    )`);

    // 2. Table des portefeuilles
    db.run(`CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        address TEXT UNIQUE NOT NULL,
        balance REAL DEFAULT 0,
        total_received REAL DEFAULT 0,
        total_sent REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 3. Table des actifs (cryptos)
    db.run(`CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        icon TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
        UNIQUE(wallet_id, symbol)
    )`);

    // 4. Table des transactions
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        tx_hash TEXT UNIQUE NOT NULL,
        type TEXT CHECK(type IN ('send', 'receive', 'swap')),
        amount REAL NOT NULL,
        symbol TEXT NOT NULL,
        recipient TEXT,
        sender TEXT,
        fee REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        confirmations INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    )`);

    // 5. Table des sessions
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_revoked BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // 6. Table des logs de sécurité
    db.run(`CREATE TABLE IF NOT EXISTS security_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        ip_address TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);

    // 7. Table des prix crypto (cache)
    db.run(`CREATE TABLE IF NOT EXISTS crypto_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE NOT NULL,
        price_usd REAL NOT NULL,
        change_24h REAL,
        volume_24h REAL,
        market_cap REAL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Créer les index pour les performances
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(tx_hash)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);

    // Insérer les cryptos par défaut
    const defaultAssets = [
        { symbol: 'BET', name: 'Bet Token', icon: '🎲' },
        { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
        { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
        { symbol: 'USDT', name: 'Tether', icon: '💵' },
        { symbol: 'BNB', name: 'Binance Coin', icon: '🔶' },
        { symbol: 'SOL', name: 'Solana', icon: '◎' }
    ];

    defaultAssets.forEach(asset => {
        db.run(`INSERT OR IGNORE INTO crypto_prices (symbol, price_usd) VALUES (?, ?)`, 
            [asset.symbol, asset.symbol === 'BTC' ? 57000 : asset.symbol === 'ETH' ? 3200 : 1]);
    });

    console.log('✅ Base de données initialisée avec succès !');
    console.log('📊 Tables créées : users, wallets, assets, transactions, sessions, security_logs, crypto_prices');
});

module.exports = db;