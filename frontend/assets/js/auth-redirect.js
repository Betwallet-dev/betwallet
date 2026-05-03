// Vérifier si l'utilisateur est connecté avant d'accéder au dashboard
const token = localStorage.getItem('token');
const currentPage = window.location.pathname;

// Si on essaie d'accéder au dashboard sans token, rediriger vers login
if (currentPage.includes('dashboard.html') && !token) {
    window.location.href = 'index.html';
}

// Si on est sur login et qu'on a déjà un token, rediriger vers dashboard
if ((currentPage === '/' || currentPage === '/index.html') && token) {
    window.location.href = 'dashboard.html';
}