const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://betwallet-api.onrender.com/api';
console.log('🔗 API URL:', API_URL); // Ajoutez cette ligne pour déboguer

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
            
            // Paramètres
            document.getElementById('settingsUsername').value = user.username;
            document.getElementById('settingsEmail').value = user.email;
            document.getElementById('settingsWalletAddress').value = user.walletAddress;
            
            renderAssets(data.dashboard.assets);
            renderTransactions(data.dashboard.recentTransactions);
            renderAllTransactions(data.dashboard.assets[0]?.transactions || []);
            initChart(data.dashboard.chartData);
        }
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
        alert('Erreur de chargement des données');
    }
}

function renderAssets(assets) {
    const assetsList = document.getElementById('assetsList');
    const assetsGrid = document.getElementById('assetsGrid');
    
    const html = assets.map(asset => `
        <div class="asset-card">
            <div class="asset-symbol">${asset.icon || '💰'} ${asset.symbol}</div>
            <div class="asset-name" style="font-size:12px; color:#9ca3af; margin-bottom:10px;">${asset.name}</div>
            <div class="asset-balance">${asset.balance.toLocaleString()} ${asset.symbol}</div>
            <div class="asset-value">$${asset.usdValue.toLocaleString()}</div>
        </div>
    `).join('');
    
    assetsList.innerHTML = html;
    assetsGrid.innerHTML = html;
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
                <div style="font-weight:600; ${tx.type === 'receive' ? 'color:#10b981' : 'color:#ef4444'}">
                    ${tx.type === 'receive' ? '+' : '-'}${tx.amount} ${tx.symbol}
                </div>
                <div style="font-size:11px; color:#6b7280;">${tx.hash?.substring(0, 10)}...</div>
            </div>
        </div>
    `).join('');
}

function renderAllTransactions(transactions) {
    const container = document.getElementById('allTransactions');
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="tx-item">Aucune transaction</div>';
        return;
    }
    
    container.innerHTML = transactions.map(tx => `
        <div class="tx-item">
            <div>
                <span style="font-weight:600;">${tx.type === 'receive' ? '📥 Reçu' : '📤 Envoyé'}</span>
                <div style="font-size:12px; color:#6b7280;">${new Date(tx.date).toLocaleString()}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:600;">${tx.amount} ${tx.symbol}</div>
                <div style="font-size:11px; color:#6b7280;">${tx.hash}</div>
            </div>
        </div>
    `).join('');
}

function initChart(chartData) {
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    if (portfolioChart) portfolioChart.destroy();
    
    portfolioChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Valeur du portefeuille ($)',
                data: chartData.values,
                borderColor: '#f5b042',
                backgroundColor: 'rgba(245, 176, 66, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#f5b042',
                pointBorderColor: '#0a0c1a',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#eef2ff', font: { size: 12 } }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1f2648',
                    titleColor: '#f5b042',
                    bodyColor: '#eef2ff'
                }
            },
            scales: {
                y: {
                    grid: { color: '#1f2648' },
                    ticks: { color: '#9ca3af', callback: (v) => '$' + v.toLocaleString() }
                },
                x: {
                    grid: { color: '#1f2648' },
                    ticks: { color: '#9ca3af' }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// Modals
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

// Envoi de transaction
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
            loadDashboard(); // Recharger les données
        } else {
            alert(data.error || 'Erreur lors de l\'envoi');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de l\'envoi de la transaction');
    }
});

// Copier l'adresse
function copyAddress() {
    const address = document.getElementById('receiveAddress').textContent;
    navigator.clipboard.writeText(address);
    alert('Adresse copiée dans le presse-papier !');
}

function refreshDashboard() {
    loadDashboard();
}

// Fermer les modals en cliquant en dehors
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Initialisation
loadDashboard();