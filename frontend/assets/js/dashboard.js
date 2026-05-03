const API_URL = 'https://supportblockchain.finance/api';
let portfolioChart = null;

// Vérifier l'authentification
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'index.html';
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        
        item.classList.add('active');
        document.getElementById(`${page}Page`).classList.add('active');
    });
});

// Déconnexion
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

// Charger les données du dashboard
async function loadDashboard() {
    try {
        console.log('Chargement du dashboard...');
        const response = await fetch(`${API_URL}/wallet/dashboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const user = JSON.parse(localStorage.getItem('user'));
            document.getElementById('username').textContent = user.username;
            document.getElementById('walletAddress').textContent = user.walletAddress;
            document.getElementById('totalBalance').textContent = `$${data.dashboard.totalBalance.toLocaleString()}`;
            document.getElementById('betBalance').textContent = `${data.dashboard.betBalance} BET`;
            
            document.getElementById('settingsUsername').value = user.username;
            document.getElementById('settingsEmail').value = user.email;
            document.getElementById('settingsWalletAddress').value = user.walletAddress;
            
            renderAssets(data.dashboard.assets);
            renderTransactions(data.dashboard.recentTransactions);
            initChart(data.dashboard.chartData);
        } else {
            console.error('Erreur API:', data);
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
        document.getElementById('totalBalance').textContent = '$0';
        document.getElementById('betBalance').textContent = '0 BET';
    }
}

function renderAssets(assets) {
    const assetsList = document.getElementById('assetsList');
    const assetsGrid = document.getElementById('assetsGrid');
    
    if (!assets || assets.length === 0) {
        assetsList.innerHTML = '<div class="asset-card">Aucun actif trouvé</div>';
        if (assetsGrid) assetsGrid.innerHTML = '<div class="asset-card">Aucun actif trouvé</div>';
        return;
    }
    
    const html = assets.map(asset => `
        <div class="asset-card">
            <div class="asset-symbol">${asset.icon || '💰'} ${asset.symbol}</div>
            <div class="asset-balance">${(asset.balance || 0).toLocaleString()} ${asset.symbol}</div>
            <div class="asset-value">$${(asset.usdValue || 0).toLocaleString()}</div>
        </div>
    `).join('');
    
    assetsList.innerHTML = html;
    if (assetsGrid) assetsGrid.innerHTML = html;
}

function renderTransactions(transactions) {
    const container = document.getElementById('recentTransactions');
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="tx-item">Aucune transaction récente</div>';
        return;
    }
    
    container.innerHTML = transactions.map(tx => `
        <div class="tx-item">
            <div>
                <span style="font-weight:600;">${tx.type === 'receive' ? '📥 Reçu' : '📤 Envoyé'}</span>
                <div style="font-size:12px; color:#6b7280;">${new Date(tx.date).toLocaleDateString()}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:600;">${tx.amount} ${tx.symbol}</div>
            </div>
        </div>
    `).join('');
}

function initChart(chartData) {
    const ctx = document.getElementById('portfolioChart');
    if (!ctx) return;
    
    if (portfolioChart) portfolioChart.destroy();
    
    portfolioChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
            datasets: [{
                label: 'Valeur du portefeuille ($)',
                data: chartData.values || [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#f5b042',
                backgroundColor: 'rgba(245, 176, 66, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#f5b042',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#eef2ff' } }
            },
            scales: {
                y: { grid: { color: '#1f2648' }, ticks: { color: '#9ca3af' } },
                x: { grid: { color: '#1f2648' }, ticks: { color: '#9ca3af' } }
            }
        }
    });
}

function openSendModal() {
    document.getElementById('sendModal').style.display = 'block';
}

function openReceiveModal() {
    document.getElementById('receiveModal').style.display = 'block';
    const user = JSON.parse(localStorage.getItem('user'));
    document.getElementById('receiveAddress').textContent = user.walletAddress;
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

document.getElementById('sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = document.getElementById('sendTo').value;
    const amount = parseFloat(document.getElementById('sendAmount').value);
    
    if (!to || !amount || amount <= 0) {
        alert('Veuillez remplir tous les champs correctement');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/wallet/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ to, amount, symbol: 'BET' })
        });
        
        const data = await response.json();
        if (data.success) {
            alert('Transaction envoyée avec succès !');
            closeModal('sendModal');
            document.getElementById('sendForm').reset();
            loadDashboard();
        } else {
            alert(data.error || 'Erreur lors de l\'envoi');
        }
    } catch (error) {
        alert('Erreur réseau');
    }
});

function copyAddress() {
    const address = document.getElementById('receiveAddress').textContent;
    navigator.clipboard.writeText(address);
    alert('Adresse copiée !');
}

function refreshDashboard() {
    loadDashboard();
}

window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Initialisation
loadDashboard();