document.addEventListener('DOMContentLoaded', () => {
    // --- Auth ---
    const authContainers = document.querySelectorAll('[id^="auth-container-"]');
    const forms = document.querySelectorAll('form');

    const checkAuth = () => {
        if (apiClient.apiKey) {
            authContainers.forEach(c => c.style.display = 'none');
            forms.forEach(f => {
                f.querySelectorAll('input, textarea, button').forEach(el => el.disabled = false);
            });
        } else {
            authContainers.forEach(c => c.style.display = 'block');
            forms.forEach(f => {
                f.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
            });
        }
    };

    document.querySelectorAll('[id^="save-key-"]').forEach(button => {
        button.addEventListener('click', () => {
            const keyInput = button.previousElementSibling;
            const key = keyInput.value;
            if (key) {
                apiClient.setApiKey(key);
                checkAuth();
            }
        });
    });

    // --- Tab 1: General Research Agent ---
    const chatFormUnblock = document.getElementById('chat-form-unblock');
    const chatInputUnblock = document.getElementById('chat-input-unblock');
    const chatMessagesUnblock = document.getElementById('chat-messages-unblock');

    chatFormUnblock.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = chatInputUnblock.value;
        if (!query) return;

        appendMessage('user', query, chatMessagesUnblock);
        chatInputUnblock.value = '';

        try {
            const response = await apiClient.sendChatMessage({ query });
            appendMessage('assistant', response.response, chatMessagesUnblock);
        } catch (error) {
            appendMessage('assistant', `Error: ${error.message}`, chatMessagesUnblock);
        }
    });

    // --- Tab 2: Feasibility Agent ---
    const researchForm = document.getElementById('research-form');
    const researchPrompt = document.getElementById('research-prompt');
    const researchStatus = document.getElementById('research-status');

    researchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = researchPrompt.value;
        if (!prompt) return;

        researchStatus.innerHTML = `<p class="text-blue-500">Submitting research job...</p>`;
        try {
            const response = await apiClient.submitFeasibilityJob(prompt);
            researchStatus.innerHTML = `<p class="text-green-500">Job submitted! ID: ${response.jobId}, UUID: ${response.uuid}</p><p>Track its progress on the Dashboard.</p>`;
            researchPrompt.value = '';
        } catch (error) {
            researchStatus.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
        }
    });

    // --- Tab 3: Knowledge Curation ---
    const chatFormCurate = document.getElementById('chat-form-curate');
    // ... (implementation for curation chat)

    // --- Helper Functions ---
    function appendMessage(role, content, container) { /* ... */ }

    // Initial Load
    checkAuth();
});
