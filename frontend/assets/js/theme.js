function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
        toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function addThemeToggle() {
    if (document.getElementById('themeToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.onclick = toggleTheme;
    document.body.appendChild(btn);
    updateThemeIcon(localStorage.getItem('theme') || 'dark');
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    addThemeToggle();
});