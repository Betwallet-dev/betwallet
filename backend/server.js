const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Initialisation de la base de données
const db = require('./src/database/init');

// Import des contrôleurs
const authController = require('./src/controllers/auth.controller.db');
const walletController = require('./src/controllers/wallet.controller.db');
const authMiddleware = require('./src/middleware/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION CORS CORRIGÉE ====================
const allowedOrigins = [
    'http://localhost:54892',
    'http://127.0.0.1:54892',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://localhost:8080'
];

app.use(cors({
    origin: function(origin, callback) {
        // Permettre les requêtes sans origine (ex: Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'La politique CORS ne permet pas cette origine.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Gestion explicite des preflight requests
app.options('*', cors());

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging simple
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ==================== ROUTES ====================
// Routes publiques
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'BetWallet API is running',
        timestamp: new Date().toISOString(),
        database: 'SQLite connected'
    });
});

app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// Routes protégées
app.get('/api/wallet/balance', authMiddleware, walletController.getBalance);
app.get('/api/wallet/dashboard', authMiddleware, walletController.getDashboardData);
app.post('/api/wallet/send', authMiddleware, walletController.sendTransaction);
app.get('/api/wallet/transactions', authMiddleware, walletController.getTransactions);

// Déconnexion
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    res.json({ success: true, message: 'Déconnecté' });
});

// ==================== GESTION DES ERREURS ====================
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err, req, res, next) => {
    console.error('❌ Erreur:', err);
    
    if (err.message.includes('CORS')) {
        return res.status(403).json({ error: 'CORS error: ' + err.message });
    }
    
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ==================== DÉMARRAGE ====================
app.listen(PORT, () => {
    console.log(`\n🚀 BetWallet API démarrée sur http://localhost:${PORT}`);
    console.log('📋 Endpoints disponibles:');
    console.log('   POST   /api/auth/register');
    console.log('   POST   /api/auth/login');
    console.log('   GET    /api/wallet/dashboard');
    console.log('   GET    /api/wallet/balance');
    console.log('   POST   /api/wallet/send\n');
});