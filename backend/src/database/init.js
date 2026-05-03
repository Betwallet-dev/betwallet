const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../../betwallet.db');
const db = new Database(dbPath);

console.log('📦 Initialisation de la base de données BetWallet...');

// Création des tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        wallet_address TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        address TEXT UNIQUE NOT NULL,
        balance REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        balance REAL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('send', 'receive')),
        amount REAL NOT NULL,
        symbol TEXT NOT NULL,
        recipient TEXT,
        tx_hash TEXT UNIQUE,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
    );
`);
// Table wallets améliorée (comme Trust Wallet)
db.run(`CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    seed_phrase TEXT NOT NULL,  -- Stocké chiffré en production !
    eth_address TEXT UNIQUE NOT NULL,
    btc_address TEXT UNIQUE NOT NULL,
    sol_address TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`);

console.log('✅ Base de données initialisée avec succès !');

module.exports = db;