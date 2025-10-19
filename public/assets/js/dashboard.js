// public/assets/js/dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    const healthOutput = document.getElementById('health-output');
    const runHealthCheckBtn = document.getElementById('run-health-check');
    const jobsList = document.getElementById('jobs-list');

    // --- Health Check ---
    const fetchHealthStatus = async () => {
        try {
            healthOutput.textContent = 'Loading health status...';
            const data = await apiClient.getHealthStatus();
            healthOutput.textContent = JSON.stringify(data, null, 2);
        } catch (error) {
            healthOutput.textContent = `Error: ${error.message}`;
        }
    };

    runHealthCheckBtn.addEventListener('click', async () => {
        try {
            healthOutput.textContent = 'Running health check...';
            const data = await apiClient.runHealthCheck();
            healthOutput.textContent = JSON.stringify(data, null, 2);
        } catch (error) {
            healthOutput.textContent = `Error: ${error.message}`;
        }
    });

    // --- Jobs List ---
    const fetchJobs = async () => {
        try {
            jobsList.innerHTML = '<p>Loading jobs...</p>';
            const jobs = await apiClient.getJobs();
            jobsList.innerHTML = jobs.map(job => `
                <div class="p-2 border rounded dark:border-gray-600">
                    <p class="font-mono text-sm">ID: ${job.id}</p>
                    <p>Status: ${job.status}</p>
                    <p class="truncate">Prompt: ${job.request_prompt}</p>
                </div>
            `).join('');
        } catch (error) {
            jobsList.innerHTML = `<p class="text-red-500">Error loading jobs: ${error.message}</p>`;
        }
    };

    // Initial Load
    fetchHealthStatus();
    fetchJobs();
});
