// WebSocket pour prix en temps réel
let socket = null;
let currentPrices = {};

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}`;
    
    try {
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log('📡 WebSocket connecté');
        };
        
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.prices) {
                    currentPrices = data.prices;
                    updatePricesDisplay();
                }
            } catch (e) {
                console.error('Erreur parsing WebSocket:', e);
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        socket.onclose = () => {
            console.log('WebSocket déconnecté, reconnexion dans 10s...');
            setTimeout(initWebSocket, 10000);
        };
    } catch (error) {
        console.error('Erreur WebSocket:', error);
    }
}

function updatePricesDisplay() {
    for (const [symbol, priceData] of Object.entries(currentPrices)) {
        const priceElement = document.getElementById(`price-${symbol}`);
        const changeElement = document.getElementById(`change-${symbol}`);
        
        if (priceElement) {
            priceElement.textContent = `$${priceData.usd?.toLocaleString() || '0'}`;
        }
        
        if (changeElement && priceData.change24h !== undefined) {
            const change = priceData.change24h;
            const changeClass = change >= 0 ? 'positive' : 'negative';
            const changeIcon = change >= 0 ? '▲' : '▼';
            changeElement.textContent = `${changeIcon} ${Math.abs(change).toFixed(2)}%`;
            changeElement.className = `price-change ${changeClass}`;
        }
    }
}

// Démarrer WebSocket au chargement
document.addEventListener('DOMContentLoaded', initWebSocket);