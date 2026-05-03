const WalletService = require('../services/wallet.service');
const db = require('../database/init');

class WalletController {
    
    // Créer un nouveau wallet avec seed phrase
    static async createWallet(req, res) {
        try {
            const { userId } = req.body;
            
            // Générer seed phrase de 12 mots
            const seedPhrase = WalletService.generateSeedPhrase();
            
            // Créer les adresses multi-chaînes
            const multiWallet = await WalletService.createMultiChainWallet(seedPhrase);
            
            // Sauvegarder dans la base de données
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO wallets (user_id, seed_phrase, eth_address, btc_address, sol_address) 
                        VALUES (?, ?, ?, ?, ?)`,
                    [userId, seedPhrase, multiWallet.ethereum.address, multiWallet.bitcoin.address, multiWallet.solana.address],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    });
            });
            
            res.json({
                success: true,
                wallet: {
                    seedPhrase: seedPhrase,
                    ethereum: multiWallet.ethereum.address,
                    bitcoin: multiWallet.bitcoin.address,
                    solana: multiWallet.solana.address
                }
            });
        } catch (error) {
            console.error('Erreur création wallet:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    // Importer un wallet existant (seed phrase)
    static async importWallet(req, res) {
        try {
            const { userId, seedPhrase } = req.body;
            
            // Vérifier si la seed phrase est valide
            if (!bip39.validateMnemonic(seedPhrase)) {
                return res.status(400).json({ success: false, error: 'Seed phrase invalide' });
            }
            
            // Recréer les adresses
            const multiWallet = await WalletService.createMultiChainWallet(seedPhrase);
            
            res.json({
                success: true,
                wallet: {
                    ethereum: multiWallet.ethereum.address,
                    bitcoin: multiWallet.bitcoin.address,
                    solana: multiWallet.solana.address
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    
    // Obtenir les soldes réels (via APIs blockchain)
    static async getBalances(req, res) {
        try {
            const userId = req.user.id;
            
            const wallet = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM wallets WHERE user_id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });
            
            if (!wallet) {
                return res.status(404).json({ success: false, error: 'Wallet non trouvé' });
            }
            
            // Récupérer soldes réels depuis les blockchains
            const ethBalance = await getEthBalance(wallet.eth_address);
            const btcBalance = await getBtcBalance(wallet.btc_address);
            const solBalance = await getSolBalance(wallet.sol_address);
            
            res.json({
                success: true,
                balances: {
                    ethereum: { balance: ethBalance, symbol: 'ETH' },
                    bitcoin: { balance: btcBalance, symbol: 'BTC' },
                    solana: { balance: solBalance, symbol: 'SOL' }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

// Fonctions pour récupérer les soldes réels
async function getEthBalance(address) {
    const provider = new ethers.JsonRpcProvider('https://cloudflare-eth.com');
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
}

async function getBtcBalance(address) {
    const response = await fetch(`https://blockchain.info/q/addressbalance/${address}`);
    const balance = await response.json();
    return balance / 1e8;
}

async function getSolBalance(address) {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const balance = await connection.getBalance(new PublicKey(address));
    return balance / 1e9;
}

module.exports = WalletController;