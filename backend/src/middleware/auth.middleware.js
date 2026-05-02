const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Accès non autorisé. Token manquant.' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = UserModel.findById(decoded.id);
        
        if (!user) {
            throw new Error('Utilisateur non trouvé');
        }
        
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            error: 'Token invalide ou expiré' 
        });
    }
};

module.exports = authMiddleware;