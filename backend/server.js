const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const users = [];

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'BetWallet API running' });
});

app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ success: false, error: 'Champs requis' });
    }
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
    }
    const userId = users.length + 1;
    const walletAddress = `0x${Math.random().toString(36).substring(2, 15)}${Date.now()}`;
    users.push({ id: userId, username, email, password, walletAddress });
    const token = `token_${userId}_${Date.now()}`;
    res.json({ success: true, token, user: { id: userId, username, email, walletAddress } });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }
    const token = `token_${user.id}_${Date.now()}`;
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, walletAddress: user.walletAddress } });
});

app.get('/api/wallet/dashboard', (req, res) => {
    res.json({
        success: true,
        dashboard: {
            totalBalance: 7150,
            assets: [
                { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850, icon: '₿' },
                { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400, icon: 'Ξ' },
                { symbol: 'BNB', name: 'BNB Smart Chain', balance: 2.5, usdValue: 1320, icon: '🔶' },
                { symbol: 'SOL', name: 'Solana', balance: 10, usdValue: 1400, icon: '◎' },
                { symbol: 'USDT', name: 'Tether (BSC)', balance: 500, usdValue: 500, icon: '💵' }
            ],
            transactions: [
                { type: 'receive', amount: 0.02, symbol: 'BTC', usdValue: 1140, date: new Date(Date.now() - 2*24*3600000).toISOString(), from: 'Binance' },
                { type: 'send', amount: 0.5, symbol: 'ETH', usdValue: 1600, date: new Date(Date.now() - 5*24*3600000).toISOString(), to: '0x1234...5678' },
                { type: 'receive', amount: 100, symbol: 'USDT', usdValue: 100, date: new Date(Date.now() - 8*24*3600000).toISOString(), from: 'Coinbase' },
                { type: 'swap', amount: 2, symbol: 'BNB', usdValue: 1040, date: new Date(Date.now() - 12*24*3600000).toISOString() }
            ]
        }
    });
});

app.post('/api/wallet/send', (req, res) => {
    const { to, amount, symbol } = req.body;
    res.json({ success: true, message: `Transaction de ${amount} ${symbol} vers ${to} simulée`, txHash: `0x${Math.random().toString(36).substring(2, 15)}` });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BetWallet API démarrée sur http://0.0.0.0:${PORT}`);
});