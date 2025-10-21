// public/assets/js/client.js
// Centralizes all communication with the backend API and manages authentication.

class ApiClient {
    constructor() {
        this.baseUrl = window.location.origin;
        this.apiKey = null;
        this.loadApiKey(); // Load key from localStorage on initialization
    }

    // --- Auth Management ---
    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('worker_api_key', key);
    }

    loadApiKey() {
        const key = localStorage.getItem('worker_api_key');
        if (key) {
            this.apiKey = key;
        }
    }

    getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            headers['X-API-Key'] = this.apiKey;
        }
        return headers;
    }

    // --- Generic Fetch ---
    async _fetch(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, options);
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }
        return response.json();
    }

    // --- Protected Methods ---
    runHealthCheck() {
        return this._fetch('/api/health/run', { method: 'POST', headers: this.getAuthHeaders() });
    }

    submitFeasibilityJob(prompt) {
        return this._fetch('/api/feasibility', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ prompt }),
        });
    }

    sendChatMessage(payload) {
        return this._fetch('/api/chat', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(payload),
        });
    }

    highlightItem(source, id, highlighted) {
        return this._fetch('/api/library/highlight', {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ source, id, highlighted }),
        });
    }

    // --- Public Methods ---
    getHealthStatus() {
        return this._fetch('/api/health/status');
    }

    getJobs(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this._fetch(`/api/jobs?${query}`);
    }

    getJobPacket(id) {
        return this._fetch(`/api/jobs/${id}/packet`);
    }

    getLibrary(source) {
        return this._fetch(`/api/library/${source}`);
    }
}

const apiClient = new ApiClient();