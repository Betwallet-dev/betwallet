const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
        user: 'contact@supportblockchain.finance',
        pass: 'VOTRE_MOT_DE_PASSE_EMAIL'
    }
});

async function sendWelcomeEmail(to, username) {
    await transporter.sendMail({
        from: '"BetWallet" <contact@supportblockchain.finance>',
        to: to,
        subject: 'Bienvenue sur BetWallet !',
        html: `
            <h1>Bienvenue ${username} !</h1>
            <p>Votre portefeuille crypto BetWallet est prêt.</p>
            <p>Connectez-vous : <a href="https://supportblockchain.finance">supportblockchain.finance</a></p>
        `
    });
}

module.exports = { sendWelcomeEmail };