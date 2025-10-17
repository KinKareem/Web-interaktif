const VERSION = "v3";
const STATIC_CACHE = `story-app-static-${VERSION}`;
const API_CACHE = `story-app-api-${VERSION}`;

const staticAssets = [
    "/",
    "/index.html",
    "/manifest.json",
    "/styles.css",
    "/src/main.js",
    "/src/router.js",
    "/src/presenters/pagePresenter.js",
    "/src/models/apiModel.js",
    "/src/models/dataModel.js",
    "/src/db/favorite-db.js",
    "/scripts/pwa-init.js",
    "/src/views/homeView.js",
    "/src/views/aboutView.js",
    "/src/views/contactView.js",
    "/src/views/mapView.js",
    "/src/views/addstoryView.js",
    "/src/views/favoritesView.js",
    "/src/views/login-page.js",
    "/src/views/register-page.js",
    "/icons/icon-192x192.png",
    "/icons/icon-512x512.png",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

// Install & cache shell
self.addEventListener("install", (event) => {
    console.log(`🔧 Service Worker ${VERSION} installing...`);
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then((cache) => {
                console.log("📦 Caching static assets");
                return cache.addAll(staticAssets);
            }),
            caches.open(API_CACHE).then(() => console.log("📦 API cache created"))
        ])
    );
    self.skipWaiting();
});

// Activate & clean old caches
self.addEventListener("activate", (event) => {
    console.log(`✅ Service Worker ${VERSION} activated`);
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    // Hapus semua cache yang bukan versi saat ini
                    .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
                    .map((name) => {
                        console.log(`🗑️ Deleting old cache: ${name}`);
                        return caches.delete(name);
                    })
            );

            // Ambil kontrol semua client
            await self.clients.claim();

            // Notifikasi ke semua client bahwa SW sudah update
            const clientsList = await self.clients.matchAll({ type: "window" });
            for (const client of clientsList) {
                client.postMessage({ type: "SW_UPDATED", version: VERSION });
            }
        })()
    );
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Abaikan permintaan non-GET
    if (event.request.method !== "GET") return;

    // Abaikan API proxy lokal (dev)
    if (url.pathname.startsWith("/api")) return;

    // Network-first untuk API Dicoding
    if (url.origin === "https://story-api.dicoding.dev") {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const resToCache = response.clone();
                        caches.open(API_CACHE).then((cache) => cache.put(event.request, resToCache));
                    }
                    return response;
                })
                .catch(() =>
                    caches.match(event.request).then((cachedRes) => {
                        return (
                            cachedRes ||
                            new Response(
                                JSON.stringify({ error: true, message: "Offline or network failed" }),
                                { headers: { "Content-Type": "application/json" }, status: 503 }
                            )
                        );
                    })
                )
        );
        return;
    }

    // Cache-first untuk aset statis
    event.respondWith(
        caches.match(event.request).then((cacheRes) => {
            return (
                cacheRes ||
                fetch(event.request).then((response) => {
                    if (response && response.status === 200 && response.type === "basic") {
                        const resToCache = response.clone();
                        caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, resToCache));
                    }
                    return response;
                })
            );
        })
    );
});

// Push Notification - Format sesuai dokumentasi Dicoding
self.addEventListener("push", (event) => {
    console.log("📬 Push notification received");

    let notificationData = {
        title: "Cerita Baru!",
        options: {
            body: "Cek cerita terbaru di aplikasi!",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png",
            data: {
                url: "/#/",
            }
        }
    };

    // Parse data dari server
    if (event.data) {
        try {
            const payload = event.data.json();

            // Format dari Dicoding API sesuai dokumentasi
            if (payload.title) {
                notificationData.title = payload.title;
            }

            if (payload.options) {
                notificationData.options = {
                    ...notificationData.options,
                    ...payload.options
                };
            }

            // Fallback untuk format lain (jika ada)
            if (payload.body && !payload.options) {
                notificationData.options.body = payload.body;
            }

            if (payload.icon) {
                notificationData.options.icon = payload.icon;
            }

            if (payload.url) {
                notificationData.options.data = { url: payload.url };
            }

            console.log("📬 Notification payload:", payload);
        } catch (error) {
            console.error("❌ Failed to parse push notification:", error);
        }
    }

    // Tambahkan action buttons
    notificationData.options.actions = [
        {
            action: "view",
            title: "Lihat",
            icon: "/icons/icon-192x192.png"
        },
        {
            action: "dismiss",
            title: "Tutup"
        }
    ];

    event.waitUntil(
        self.registration.showNotification(
            notificationData.title,
            notificationData.options
        )
    );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
    console.log("🖱️ Notification clicked:", event.action);
    event.notification.close();

    if (event.action === "view" || !event.action) {
        const targetUrl = event.notification.data?.url || "/#/";

        event.waitUntil(
            clients.matchAll({ type: "window", includeUncontrolled: true })
                .then((clientList) => {
                    // Cek apakah sudah ada window yang terbuka
                    for (const client of clientList) {
                        if (client.url === targetUrl && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // Jika tidak ada, buka window baru
                    if (clients.openWindow) {
                        return clients.openWindow(targetUrl);
                    }
                })
        );
    } else if (event.action === "dismiss") {
        console.log("📭 Notification dismissed");
    }
});

// Background Sync (optional - untuk retry failed requests)
self.addEventListener("sync", (event) => {
    console.log("🔄 Background sync triggered:", event.tag);

    if (event.tag === "sync-stories") {
        event.waitUntil(
            // Di sini Anda bisa tambahkan logic untuk sync data
            Promise.resolve()
        );
    }
});

// Message handler dari client
self.addEventListener("message", (event) => {
    console.log("💬 Message received from client:", event.data);

    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});