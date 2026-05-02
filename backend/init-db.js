const db = require('./src/database/init');

console.log('🔄 Initialisation de BetWallet Database...');

setTimeout(() => {
    console.log('✅ Base de données prête !');
    console.log('📁 Fichier : betwallet.db');
    db.close();
}, 2000);