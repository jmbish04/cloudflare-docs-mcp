// public/assets/js/curation.js

document.addEventListener('DOMContentLoaded', () => {
    const d1Table = document.getElementById('d1-table');
    const kvTable = document.getElementById('kv-table');
    const chatMessages = document.getElementById('chat-messages-curate');
    const chatForm = document.getElementById('chat-form-curate');
    const chatInput = document.getElementById('chat-input-curate');

    let highlightedItems = { d1: new Set(), kv: new Set() };

    // --- Data Loading ---
    const renderD1Table = async () => {
        try {
            const data = await apiClient.getLibrary('d1');
            const table = createTable(data, ['id', 'title', 'tags', 'is_highlighted'], 'd1');
            d1Table.innerHTML = '';
            d1Table.appendChild(table);
        } catch (e) { d1Table.innerHTML = `<p class="text-red-500 p-4">Error: ${e.message}</p>`; }
    };

    const renderKvTable = async () => {
        try {
            const data = await apiClient.getLibrary('kv');
            const table = createTable(data, ['name'], 'kv');
            kvTable.innerHTML = '';
            kvTable.appendChild(table);
        } catch (e) { kvTable.innerHTML = `<p class="text-red-500 p-4">Error: ${e.message}</p>`; }
    };

    // --- WebSocket Logic ---
    const socket = new WebSocket(`wss://${window.location.host}/ws`);
    socket.onopen = () => appendChatMessage('system', 'Real-time connection established.');
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        appendChatMessage('system', `[EVENT] ${data.event} on ${data.source} ID ${data.id}`);
        // TODO: Add logic to reactively update tables on 'update' or 'delete' events
        if (data.event === 'highlight') {
            document.querySelector(`tr[data-source="${data.source}"][data-id="${data.id}"]`)?.classList.toggle('bg-yellow-200', data.highlighted);
        }
    };
    socket.onclose = () => appendChatMessage('system', 'Real-time connection lost.');

    // --- Event Handlers ---
    document.body.addEventListener('click', async (e) => {
        if (e.target.matches('[data-source] *')) {
            const row = e.target.closest('tr');
            const source = row.dataset.source;
            const id = row.dataset.id;
            const isHighlighted = !highlightedItems[source].has(id);

            try {
                await apiClient.highlightItem(source, id, isHighlighted);
                // The websocket broadcast will handle the UI update
            } catch (error) {
                console.error("Failed to highlight item:", error);
            }
        }
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value;
        if (!message) return;
        
        appendChatMessage('user', message);
        
        // Include highlighted items in the payload to the agent
        const payload = {
            query: message,
            context: {
                highlighted: {
                    d1: Array.from(highlightedItems.d1),
                    kv: Array.from(highlightedItems.kv),
                }
            }
        };
        // This would be a real API call to the chat endpoint
        console.log("Sending to agent:", payload);
        
        chatInput.value = '';
    });

    // --- UI Helpers ---
    function createTable(data, headers, source) {
        const table = document.createElement('table');
        table.className = "w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400";
        const thead = `
            <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                <tr>${headers.map(h => `<th scope="col" class="px-6 py-3">${h}</th>`).join('')}</tr>
            </thead>`;
        const tbody = `
            <tbody>
                ${data.map(row => `
                    <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer" data-source="${source}" data-id="${row.id || row.name}">
                        ${headers.map(h => `<td class="px-6 py-4">${row[h]}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>`;
        table.innerHTML = thead + tbody;
        return table;
    }

    function appendChatMessage(role, content) {
        const container = document.getElementById('chat-messages-curate');
        const messageElement = document.createElement('div');
        messageElement.classList.add('p-2', 'rounded-lg', 'mb-2', 'max-w-xl', 'text-sm');
        if (role === 'user') {
            messageElement.classList.add('bg-blue-100', 'dark:bg-blue-800', 'self-end', 'ml-auto');
        } else {
            messageElement.classList.add('bg-gray-200', 'dark:bg-gray-700', 'self-start', 'mr-auto');
        }
        messageElement.textContent = content;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // Initial Load
    renderD1Table();
    renderKvTable();
});
