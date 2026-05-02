const UserModel = require('../models/user.model');
const WalletModel = require('../models/wallet.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class AuthController {
    async register(req, res) {
        try {
            const { username, email, password } = req.body;

            if (!username || !email || !password) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Tous les champs sont requis' 
                });
            }

            const existingUser = UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email déjà utilisé' 
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = UserModel.createUser(username, email, hashedPassword);
            const wallet = WalletModel.createWallet(user.id, user.walletAddress);

            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE }
            );

            res.status(201).json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    walletAddress: user.walletAddress
                },
                wallet: {
                    address: wallet.address,
                    balance: wallet.balance
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur serveur' 
            });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email et mot de passe requis' 
                });
            }

            const user = UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Email ou mot de passe incorrect' 
                });
            }

            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Email ou mot de passe incorrect' 
                });
            }

            const wallet = WalletModel.getWalletByUserId(user.id);
            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRE }
            );

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    walletAddress: user.walletAddress
                },
                wallet: {
                    address: wallet.address,
                    balance: wallet.balance,
                    assets: wallet.assets
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ 
                success: false, 
                error: 'Erreur serveur' 
            });
        }
    }
}

module.exports = new AuthController();