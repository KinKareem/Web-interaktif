import { initRouter } from "./router.js";
import { apiModel } from "./models/apiModel.js";
import { favoriteDB } from "./db/favorite-db.js";

import '../styles.css';

document.addEventListener("DOMContentLoaded", () => {
    initRouter();

    // Sync offline stories when coming back online
    window.addEventListener("online", async () => {
        console.log("🌐 Koneksi kembali online, sinkronisasi data offline...");
        try {
            await favoriteDB.syncOfflineStories(apiModel);
            console.log("✅ Sinkronisasi selesai");
        } catch (err) {
            console.error("❌ Gagal sinkronisasi:", err);
        }
    });
});
