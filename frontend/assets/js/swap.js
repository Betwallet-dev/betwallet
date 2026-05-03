let currentRate = null;

async function getSwapRate(from, to, amount) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/swap/rate?from=${from}&to=${to}&amount=${amount}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            currentRate = data;
            const estimateDiv = document.getElementById('swapEstimate');
            if (estimateDiv) {
                estimateDiv.innerHTML = `
                    <div>Vous recevez: ${data.toAmount.toFixed(8)} ${to}</div>
                    <div>Taux: 1 ${from} = ${data.rate} ${to}</div>
                    <div>Frais: ${data.fee.toFixed(8)} ${to}</div>
                `;
            }
        }
        return data;
    } catch (error) {
        console.error('Erreur taux swap:', error);
    }
}

async function executeSwap(from, to, amount) {
    try {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user'));
        
        const response = await fetch(`${API_URL}/swap/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ from, to, amount, userId: user.id })
        });
        
        const data = await response.json();
        if (data.success) {
            alert('Swap effectué avec succès!');
            setTimeout(() => location.reload(), 1500);
        }
        return data;
    } catch (error) {
        console.error('Erreur swap:', error);
        alert('Erreur lors du swap');
    }
}

function openSwapModal() {
    const modal = document.getElementById('swapModal');
    if (modal) modal.style.display = 'block';
}

function closeSwapModal() {
    const modal = document.getElementById('swapModal');
    if (modal) modal.style.display = 'none';
}

function createSwapModal() {
    if (document.getElementById('swapModal')) return;
    
    const modalHTML = `
        <div id="swapModal" class="modal" style="display:none">
            <div class="modal-content">
                <span class="close" onclick="closeSwapModal()">&times;</span>
                <h2>🔄 Échanger des cryptos</h2>
                <div class="swap-form">
                    <div class="input-group">
                        <label>De</label>
                        <select id="swapFrom">
                            <option value="BET">BET</option>
                            <option value="BTC">BTC</option>
                            <option value="ETH">ETH</option>
                            <option value="USDT">USDT</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label>Montant</label>
                        <input type="number" id="swapAmount" step="0.01" placeholder="0.00">
                    </div>
                    <button class="btn-secondary" onclick="getSwapRate(
                        document.getElementById('swapFrom').value,
                        document.getElementById('swapTo').value,
                        document.getElementById('swapAmount').value
                    )">Calculer</button>
                    <div class="swap-arrow">⬇️</div>
                    <div class="input-group">
                        <label>Vers</label>
                        <select id="swapTo">
                            <option value="BTC">BTC</option>
                            <option value="ETH">ETH</option>
                            <option value="USDT">USDT</option>
                            <option value="BET">BET</option>
                        </select>
                    </div>
                    <div id="swapEstimate" class="swap-estimate"></div>
                    <button class="btn-primary" onclick="executeSwap(
                        document.getElementById('swapFrom').value,
                        document.getElementById('swapTo').value,
                        document.getElementById('swapAmount').value
                    )">Confirmer l'échange</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function addSwapButton() {
    const actions = document.querySelector('.actions');
    if (actions && !document.getElementById('swapBtn')) {
        const swapBtn = document.createElement('button');
        swapBtn.id = 'swapBtn';
        swapBtn.className = 'btn-secondary';
        swapBtn.innerHTML = '🔄 Échanger';
        swapBtn.onclick = openSwapModal;
        actions.appendChild(swapBtn);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    createSwapModal();
    addSwapButton();
});