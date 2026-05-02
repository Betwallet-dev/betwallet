// Stockage en mémoire (à remplacer par une base de données en production)
const users = new Map();
let userIdCounter = 1;

class UserModel {
    static createUser(username, email, password) {
        const user = {
            id: userIdCounter++,
            username,
            email,
            password, // En production, utiliser bcrypt
            createdAt: new Date().toISOString(),
            walletAddress: `BetWallet_${Date.now()}_${Math.random().toString(36).substring(7)}`
        };
        users.set(email, user);
        return user;
    }

    static findByEmail(email) {
        return users.get(email);
    }

    static findById(id) {
        for (let user of users.values()) {
            if (user.id === id) return user;
        }
        return null;
    }

    static getAllUsers() {
        return Array.from(users.values());
    }
}

module.exports = UserModel;