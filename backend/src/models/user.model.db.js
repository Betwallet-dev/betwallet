const db = require('../database/init');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class UserModelDB {
    static async createUser(username, email, password) {
        const walletAddress = `BetWallet_${uuidv4().substring(0, 8)}_${Date.now()}`;
        const hashedPassword = await bcrypt.hash(password, 12);
        
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                db.run(`INSERT INTO users (username, email, password, wallet_address) VALUES (?, ?, ?, ?)`,
                    [username, email, hashedPassword, walletAddress],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }
                        
                        const userId = this.lastID;
                        
                        db.run(`INSERT INTO wallets (user_id, address, balance) VALUES (?, ?, ?)`,
                            [userId, walletAddress, 1000],
                            function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }
                                
                                const walletId = this.lastID;
                                
                                // Ajouter les actifs par défaut
                                const assets = [
                                    { symbol: 'BET', name: 'Bet Token', balance: 1000, usdValue: 1000 },
                                    { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850 },
                                    { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400 },
                                    { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500 }
                                ];
                                
                                let completed = 0;
                                assets.forEach(asset => {
                                    db.run(`INSERT INTO assets (wallet_id, symbol, name, balance, usd_value) VALUES (?, ?, ?, ?, ?)`,
                                        [walletId, asset.symbol, asset.name, asset.balance, asset.usdValue],
                                        (err) => {
                                            if (err) reject(err);
                                            completed++;
                                            if (completed === assets.length) {
                                                db.run('COMMIT', (err) => {
                                                    if (err) reject(err);
                                                    resolve({ userId, walletId, walletAddress });
                                                });
                                            }
                                        });
                                });
                            });
                    });
            });
        });
    }

    static async findByEmail(email) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE email = ? AND is_active = 1`, [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static async findById(id) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT id, username, email, wallet_address, email_verified, twofa_enabled, created_at, last_login FROM users WHERE id = ? AND is_active = 1`, 
                [id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static async updateLastLogin(id, ip) {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [id], (err) => {
                if (err) reject(err);
                
                // Log de sécurité
                db.run(`INSERT INTO security_logs (user_id, action, ip_address) VALUES (?, ?, ?)`,
                    [id, 'login', ip], (err) => {
                    if (err) reject(err);
                    resolve(true);
                });
            });
        });
    }

    static async createSession(userId, token, ip, userAgent) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 jours
        
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)`,
                [userId, token, ip, userAgent, expiresAt.toISOString()], (err) => {
                if (err) reject(err);
                resolve(true);
            });
        });
    }
}

module.exports = UserModelDB;