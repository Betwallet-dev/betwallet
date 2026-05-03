const bip39 = require('bip39');
const { ethers } = require('ethers');
const bitcoin = require('bitcoinjs-lib');
const { Wallet } = require('ethereumjs-wallet');
const { mnemonicToSeed } = require('bip39');

class WalletService {
    
    // Générer une seed phrase de 12 mots (comme Trust Wallet)
    static generateSeedPhrase() {
        return bip39.generateMnemonic(128); // 12 mots
    }

    // Créer un wallet multi-chaînes à partir d'une seed phrase
    static async createMultiChainWallet(seedPhrase) {
        const seed = await mnemonicToSeed(seedPhrase);
        
        // Wallet Ethereum
        const ethWallet = ethers.Wallet.fromPhrase(seedPhrase);
        const ethAddress = ethWallet.address;
        const ethPrivateKey = ethWallet.privateKey;

        // Wallet Bitcoin
        const bitcoinNode = bitcoin.bip32.fromSeed(seed);
        const bitcoinPath = `m/84'/0'/0'/0/0`;
        const bitcoinKeyPair = bitcoinNode.derivePath(bitcoinPath);
        const { address: btcAddress } = bitcoin.payments.p2wpkh({
            pubkey: bitcoinKeyPair.publicKey,
            network: bitcoin.networks.bitcoin
        });

        // Wallet Solana
        const solanaWallet = await this.generateSolanaWallet(seed);
        const solanaAddress = solanaWallet.publicKey.toString();

        return {
            seedPhrase: seedPhrase,
            ethereum: { address: ethAddress, privateKey: ethPrivateKey },
            bitcoin: { address: btcAddress },
            solana: { address: solanaAddress }
        };
    }

    static async generateSolanaWallet(seed) {
        const { Keypair } = require('@solana/web3.js');
        const seedBuffer = seed.slice(0, 32);
        return Keypair.fromSeed(seedBuffer);
    }
}

module.exports = WalletService;