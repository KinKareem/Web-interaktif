import { apiModel } from "../src/models/apiModel.js";
import { favoriteDB } from "../src/db/favorite-db.js";

// Daftarkan Service Worker
if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("✅ Service Worker terdaftar"))
        .catch((err) => console.error("❌ SW gagal:", err));
}

// Simpan event install prompt
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installBtn = document.createElement("button");
    installBtn.textContent = "📱 Install Aplikasi";
    installBtn.classList.add("install-btn");
    document.body.appendChild(installBtn);

    installBtn.addEventListener("click", async () => {
        installBtn.style.display = "none";
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User choice: ${outcome}`);
        deferredPrompt = null;
    });
});

// Online sync handler for offline stories
window.addEventListener('online', async () => {
    if (apiModel.isLoggedIn()) {
        await favoriteDB.syncOfflineStories(apiModel);
    }
});

// Push Notification Subscription Management
const VAPID_PUBLIC_KEY = "BCCs2eonMI-6H2ctvFaWg-UYdDv387Vno_bzUzALpB442r2lCnsHmtrx8biyPi_E-1fSGABK_Qs_GlvPoJJqxbk";

export const pushManager = {
    async subscribe() {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            console.warn("Push notifications not supported");
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            // Send subscription to server
            const result = await apiModel.subscribeWebPush(subscription.toJSON());
            if (result.error) {
                console.error("❌ Failed to register subscription on server");
                await subscription.unsubscribe();
                return false;
            }

            console.log("✅ Push subscription berhasil:", subscription);
            localStorage.setItem("pushSubscription", JSON.stringify(subscription));
            return true;
        } catch (err) {
            console.error("❌ Push subscription gagal:", err);
            return false;
        }
    },

    async unsubscribe() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                // Send unsubscription to server
                const result = await apiModel.unsubscribeWebPush(subscription.toJSON());
                if (result.error) {
                    console.error("❌ Failed to unregister subscription on server");
                    // Continue with local unsubscribe anyway
                }
                await subscription.unsubscribe();
                console.log("✅ Push subscription dibatalkan");
                localStorage.removeItem("pushSubscription");
                return true;
            }
        } catch (err) {
            console.error("❌ Unsubscribe gagal:", err);
        }
        return false;
    },

    async isSubscribed() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            return !!subscription;
        } catch {
            return false;
        }
    },

    urlBase64ToUint8Array(base64String) {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },
};
