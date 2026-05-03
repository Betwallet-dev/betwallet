let socket = null;
let currentPrices = {};

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => { console.log('📡 WebSocket connecté'); };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.prices) {
            currentPrices = data.prices;
            updatePricesDisplay();
        }
    };
    
    socket.onerror = (error) => { console.error('WebSocket error:', error); };
    
    socket.onclose = () => { setTimeout(initWebSocket, 5000); };
}

function updatePricesDisplay() {
    for (const [symbol, priceData] of Object.entries(currentPrices)) {
        const priceElement = document.getElementById(`price-${symbol}`);
        const changeElement = document.getElementById(`change-${symbol}`);
        
        if (priceElement) {
            priceElement.textContent = `$${priceData.usd.toLocaleString()}`;
        }
        
        if (changeElement) {
            const change = priceData.change24h;
            const changeClass = change >= 0 ? 'positive' : 'negative';
            const changeIcon = change >= 0 ? '▲' : '▼';
            changeElement.textContent = `${changeIcon} ${Math.abs(change).toFixed(2)}%`;
            changeElement.className = `price-change ${changeClass}`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebSocket);
} else {
    initWebSocket();
}