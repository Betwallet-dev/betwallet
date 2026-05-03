const express = require('express');
const router = express.Router();
const priceController = require('../controllers/price.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/all', authMiddleware, priceController.getPrices);
router.get('/historical/:symbol/:days?', authMiddleware, priceController.getHistorical);
router.get('/global', authMiddleware, priceController.getGlobal);
router.get('/gainers', authMiddleware, priceController.getTopGainers);
router.get('/losers', authMiddleware, priceController.getTopLosers);

module.exports = router;