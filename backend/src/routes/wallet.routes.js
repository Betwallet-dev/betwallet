const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/balance', authMiddleware, walletController.getBalance);
router.get('/dashboard', authMiddleware, walletController.getDashboardData);
router.post('/send', authMiddleware, walletController.sendTransaction);

module.exports = router;