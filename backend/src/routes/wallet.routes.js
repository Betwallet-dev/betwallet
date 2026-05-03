const express = require('express');
const router = express.Router();
const WalletController = require('../controllers/wallet.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/create', WalletController.createWallet);
router.post('/confirm-create', WalletController.confirmCreateWallet);
router.post('/import', WalletController.importWallet);
router.get('/balances', authMiddleware, WalletController.getBalances);
router.get('/seed', authMiddleware, WalletController.getSeedPhrase);
router.get('/address/:symbol', authMiddleware, WalletController.getAddress);
router.post('/send', authMiddleware, WalletController.sendTransaction);

module.exports = router;