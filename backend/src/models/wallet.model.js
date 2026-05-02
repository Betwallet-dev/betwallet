const wallets = new Map();

class WalletModel {
    static createWallet(userId, address) {
        const wallet = {
            userId,
            address,
            balance: 1000, // Solde initial en BET
            assets: [
                { symbol: 'BET', name: 'Bet Token', balance: 1000, usdValue: 1000, icon: '🎲' },
                { symbol: 'BTC', name: 'Bitcoin', balance: 0.05, usdValue: 2850, icon: '₿' },
                { symbol: 'ETH', name: 'Ethereum', balance: 0.8, usdValue: 2400, icon: 'Ξ' },
                { symbol: 'USDT', name: 'Tether', balance: 500, usdValue: 500, icon: '💵' }
            ],
            transactions: [
                {
                    id: 1,
                    type: 'receive',
                    amount: 500,
                    symbol: 'BET',
                    date: new Date(Date.now() - 2 * 24 * 3600000),
                    status: 'completed',
                    hash: '0xabc123...'
                },
                {
                    id: 2,
                    type: 'send',
                    amount: 200,
                    symbol: 'BET',
                    date: new Date(Date.now() - 1 * 24 * 3600000),
                    status: 'completed',
                    hash: '0xdef456...'
                }
            ],
            createdAt: new Date().toISOString()
        };
        wallets.set(address, wallet);
        return wallet;
    }

    static getWallet(address) {
        return wallets.get(address);
    }

    static getWalletByUserId(userId) {
        for (let wallet of wallets.values()) {
            if (wallet.userId === userId) return wallet;
        }
        return null;
    }

    static updateBalance(address, newBalance) {
        const wallet = wallets.get(address);
        if (wallet) {
            wallet.balance = newBalance;
            wallets.set(address, wallet);
            return wallet;
        }
        return null;
    }

    static addTransaction(address, transaction) {
        const wallet = wallets.get(address);
        if (wallet) {
            transaction.id = wallet.transactions.length + 1;
            transaction.date = new Date();
            wallet.transactions.unshift(transaction);
            wallets.set(address, wallet);
            return transaction;
        }
        return null;
    }
}

module.exports = WalletModel;