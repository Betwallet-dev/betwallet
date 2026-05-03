// Vérifier si l'utilisateur est connecté
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'index.html';
}