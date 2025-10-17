import { dataModel } from "../models/dataModel.js";
import { pushManager } from "../../scripts/pwa-init.js";

export default class HomeView {
    render() {
        const div = document.createElement("div");
        div.className = "page page-home";
        div.setAttribute("role", "region");
        div.setAttribute("aria-labelledby", "home-title");

        div.innerHTML = `
            <h1 id="home-title" class="page-title" tabindex="0">
                Welcome to ${dataModel.appName}
            </h1>
            <p class="page-text" aria-label="Deskripsi halaman home">
                Ini adalah halaman Home dengan transisi custom.
            </p>
            <div class="notification-settings">
                <button id="toggle-notifications" class="btn-toggle-notifications">
                    Enable Push Notifications
                </button>
                <p id="notification-status" class="notification-status">Checking status...</p>
            </div>
        `;
        return div;
    }

    async afterRender() {
        const toggleBtn = document.getElementById("toggle-notifications");
        const statusEl = document.getElementById("notification-status");

        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            statusEl.textContent = "Push notifications not supported in this browser.";
            toggleBtn.disabled = true;
            return;
        }

        // Check if running on HTTPS (required for push notifications)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            statusEl.textContent = "Push notifications require HTTPS. Please access via secure connection.";
            toggleBtn.disabled = true;
            return;
        }

        // Check current subscription status
        const isSubscribed = await pushManager.isSubscribed();
        this.updateUI(isSubscribed, toggleBtn, statusEl);

        // Handle toggle
        toggleBtn.addEventListener("click", async () => {
            toggleBtn.disabled = true;
            toggleBtn.textContent = "Processing...";

            let success;
            try {
                if (isSubscribed) {
                    success = await pushManager.unsubscribe();
                } else {
                    success = await pushManager.subscribe();
                }
            } catch (error) {
                console.error("Push subscription error:", error);
                success = false;
            }

            if (success) {
                const newStatus = await pushManager.isSubscribed();
                this.updateUI(newStatus, toggleBtn, statusEl);
            } else {
                alert("Failed to update notification settings. Please check console for errors.");
                toggleBtn.disabled = false;
                toggleBtn.textContent = isSubscribed ? "Disable Notifications" : "Enable Notifications";
            }
        });
    }

    updateUI(isSubscribed, toggleBtn, statusEl) {
        if (isSubscribed) {
            toggleBtn.textContent = "Disable Push Notifications";
            statusEl.textContent = "Push notifications are enabled.";
        } else {
            toggleBtn.textContent = "Enable Push Notifications";
            statusEl.textContent = "Push notifications are disabled.";
        }
        toggleBtn.disabled = false;
    }
}
