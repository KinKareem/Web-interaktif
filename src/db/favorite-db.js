import { openDB } from "idb";

const DB_NAME = "story-db";
const STORE_FAVORITES = "favorites";
const STORE_OFFLINE_STORIES = "offline-stories";

export const favoriteDB = {
    async init() {
        return openDB(DB_NAME, 2, {
            upgrade(db, oldVersion) {
                if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
                    db.createObjectStore(STORE_FAVORITES, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(STORE_OFFLINE_STORIES)) {
                    db.createObjectStore(STORE_OFFLINE_STORIES, { keyPath: "id", autoIncrement: true });
                }
            },
        });
    },

    // Favorites CRUD
    async addFavorite(story) {
        const db = await this.init();
        await db.put(STORE_FAVORITES, story);
        console.log("📦 Story disimpan ke favorites:", story.name);
    },

    async getAllFavorites() {
        const db = await this.init();
        return db.getAll(STORE_FAVORITES);
    },

    async deleteFavorite(id) {
        const db = await this.init();
        await db.delete(STORE_FAVORITES, id);
        console.log("🗑️ Story dihapus dari favorites:", id);
    },

    // Search/Filter/Sort for favorites
    async searchFavorites(query) {
        const favorites = await this.getAllFavorites();
        return favorites.filter(story =>
            story.name.toLowerCase().includes(query.toLowerCase()) ||
            story.description.toLowerCase().includes(query.toLowerCase())
        );
    },

    async filterFavoritesByDate(order = 'desc') {
        const favorites = await this.getAllFavorites();
        return favorites.sort((a, b) => {
            const dateA = new Date(a.createdAt);
            const dateB = new Date(b.createdAt);
            return order === 'desc' ? dateB - dateA : dateA - dateB;
        });
    },

    async sortFavoritesByName(order = 'asc') {
        const favorites = await this.getAllFavorites();
        return favorites.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            if (order === 'asc') {
                return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
            } else {
                return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
            }
        });
    },

    // Offline Stories Queue
    async addOfflineStory(formData) {
        const db = await this.init();
        const storyData = {
            formData: await this.formDataToObject(formData),
            timestamp: Date.now(),
            synced: false,
        };
        const id = await db.add(STORE_OFFLINE_STORIES, storyData);
        console.log("📱 Story offline disimpan:", id);
        return id;
    },

    async getOfflineStories() {
        const db = await this.init();
        return db.getAll(STORE_OFFLINE_STORIES);
    },

    async deleteOfflineStory(id) {
        const db = await this.init();
        await db.delete(STORE_OFFLINE_STORIES, id);
        console.log("🗑️ Offline story dihapus:", id);
    },

    async markSynced(id) {
        const db = await this.init();
        const story = await db.get(STORE_OFFLINE_STORIES, id);
        if (story) {
            story.synced = true;
            await db.put(STORE_OFFLINE_STORIES, story);
            console.log("✅ Offline story marked as synced:", id);
        }
    },

    // Sync offline stories when online
    async syncOfflineStories(apiModel) {
        const offlineStories = await this.getOfflineStories();
        const unsynced = offlineStories.filter(story => !story.synced);

        for (const story of unsynced) {
            try {
                const formData = this.objectToFormData(story.formData);
                const result = await apiModel.addStory(formData);
                if (!result.error) {
                    await this.markSynced(story.id);
                    console.log("✅ Offline story synced:", story.id);
                }
            } catch (err) {
                console.error("❌ Failed to sync offline story:", story.id, err);
            }
        }
    },

    // Utility functions
    async formDataToObject(formData) {
        const obj = {};
        for (const [key, value] of formData.entries()) {
            if (value instanceof File) {
                // Convert file to base64 for storage
                obj[key] = {
                    name: value.name,
                    type: value.type,
                    size: value.size,
                    data: await this.fileToBase64(value),
                };
            } else {
                obj[key] = value;
            }
        }
        return obj;
    },

    objectToFormData(obj) {
        const formData = new FormData();
        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === 'object' && value.data) {
                // Convert base64 back to file
                const file = this.base64ToFile(value.data, value.name, value.type);
                formData.append(key, file);
            } else {
                formData.append(key, value);
            }
        }
        return formData;
    },

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    base64ToFile(base64, filename, mimeType) {
        const arr = base64.split(',');
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mimeType });
    },
};
