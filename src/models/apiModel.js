// apiModel.js
const BASE_URL = "https://story-api.dicoding.dev/v1";

export const apiModel = {
    // ===============================
    // 🔐 Autentikasi
    // ===============================
    async register(name, email, password) {
        try {
            const response = await fetch(`${BASE_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.message);
            return { success: true, message: "Registrasi berhasil! Silakan login." };
        } catch (err) {
            console.error("❌ Register gagal:", err.message);
            return { success: false, message: err.message };
        }
    },

    async login(email, password) {
        try {
            const response = await fetch(`${BASE_URL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.message);

            const token = data.loginResult.token;
            localStorage.setItem("token", token);
            localStorage.setItem("userName", data.loginResult.name);

            console.log("✅ Login berhasil, token disimpan di localStorage");
            return { success: true, message: "Login berhasil!" };
        } catch (err) {
            console.error("❌ Login gagal:", err.message);
            return { success: false, message: err.message };
        }
    },

    logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        console.log("🚪 Logout berhasil, token dihapus.");
    },

    getToken() {
        return localStorage.getItem("token");
    },

    isLoggedIn() {
        return !!localStorage.getItem("token");
    },

    // ===============================
    // 📜 Data Story
    // ===============================
    async getStories() {
        const token = this.getToken();
        if (!token) {
            console.warn("⚠️ Tidak ada token, silakan login dulu.");
            return [];
        }

        // Check if offline and use cached data
        if (!navigator.onLine) {
            const cachedStories = localStorage.getItem('cachedStories');
            if (cachedStories) {
                console.log("📦 Using cached stories from localStorage (offline mode)");
                return JSON.parse(cachedStories);
            }
            console.warn("⚠️ No cached stories available offline");
            return [];
        }

        try {
            const response = await fetch(`${BASE_URL}/stories`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            // Cache the stories in localStorage for offline use
            localStorage.setItem('cachedStories', JSON.stringify(result.listStory));
            console.log(`📦 ${result.listStory.length} story berhasil diambil dan di-cache.`);
            return result.listStory;
        } catch (err) {
            console.error("❌ Gagal memuat story:", err.message);
            // Fallback to localStorage cache
            const cachedStories = localStorage.getItem('cachedStories');
            if (cachedStories) {
                console.log("📦 Using cached stories from localStorage");
                return JSON.parse(cachedStories);
            }
            return [];
        }
    },

    async addStory(formData) {
        const token = this.getToken();
        if (!token) return { error: true, message: "Silakan login terlebih dahulu." };

        try {
            const response = await fetch(`${BASE_URL}/stories`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            console.log("✅ Story berhasil ditambahkan!");
            return { error: false, message: "Story berhasil dikirim!" };
        } catch (err) {
            console.error("❌ Gagal mengirim story:", err.message);
            return { error: true, message: err.message };
        }
    },

    // ===============================
    // 🔔 Web Push Notification
    // ===============================
    async subscribeWebPush(subscription) {
        const token = this.getToken();
        if (!token) return { error: true, message: "Silakan login terlebih dahulu." };

        try {
            // Format sesuai dokumentasi
            const body = {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth
                }
            };

            const response = await fetch(`${BASE_URL}/notifications/subscribe`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body),
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            console.log("✅ WebPush subscription berhasil:", result);
            return { error: false, message: result.message, data: result.data };
        } catch (err) {
            console.error("❌ Failed to subscribe WebPush:", err.message);
            return { error: true, message: err.message };
        }
    },

    async unsubscribeWebPush(subscription) {
        const token = this.getToken();
        if (!token) return { error: true, message: "Silakan login terlebih dahulu." };

        try {
            // Hanya kirim endpoint sesuai dokumentasi
            const body = {
                endpoint: subscription.endpoint
            };

            const response = await fetch(`${BASE_URL}/notifications/subscribe`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body),
            });

            const result = await response.json();
            if (result.error) throw new Error(result.message);

            console.log("✅ WebPush unsubscription berhasil:", result);
            return { error: false, message: result.message };
        } catch (err) {
            console.error("❌ Failed to unsubscribe WebPush:", err.message);
            return { error: true, message: err.message };
        }
    },
};