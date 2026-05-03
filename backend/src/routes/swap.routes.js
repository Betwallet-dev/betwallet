const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swap.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/rate', authMiddleware, swapController.getRate);
router.post('/execute', authMiddleware, swapController.executeSwap);

module.exports = router;