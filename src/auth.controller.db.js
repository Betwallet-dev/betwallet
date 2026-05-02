const UserModel = require('../models/user.model.db');
const WalletModel = require('../models/wallet.model.db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class AuthController {
    async register(req, res) {
        try {
            const { username, email, password } = req.body;
            
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
            }
            
            const { userId, walletAddress } = await UserModel.createUser(username, email, password);
            
            const token = jwt.sign(
                { id: userId, email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE }
            );
            
            // Créer session
            await UserModel.createSession(userId, token, req.ip, req.headers['user-agent']);
            
            res.status(201).json({
                success: true,
                token,
                user: { id: userId, username, email, walletAddress }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, error: 'Erreur serveur' });
        }
    }
    
    async login(req, res) {
        try {
            const { email, password } = req.body;
            
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
            }
            
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
            }
            
            const token = jwt.sign(
                { id: user.id, email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE }
            );
            
            await UserModel.updateLastLogin(user.id, req.ip);
            await UserModel.createSession(user.id, token, req.ip, req.headers['user-agent']);
            
            const wallet = await WalletModel.getWalletByUserId(user.id);
            
            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    walletAddress: user.wallet_address
                },
                wallet: {
                    address: wallet.address,
                    balance: wallet.balance
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, error: 'Erreur serveur' });
        }
    }
}

module.exports = new AuthController();