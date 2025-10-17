import { apiModel } from "../models/apiModel.js";
import { favoriteDB } from "../db/favorite-db.js";

export default class MapView {
    constructor() {
        this.map = null;
        this.markers = [];
        this.stories = [];
    }

    async render() {
        const container = document.createElement("div");
        container.className = "page page-map";
        container.setAttribute("role", "region");
        container.setAttribute("aria-labelledby", "map-title");

        container.innerHTML = `
            <h1 id="map-title" class="page-title" tabindex="0">Peta Cerita</h1>

            <div class="map-wrapper">
                <div id="map" class="map" role="application" aria-label="Peta lokasi cerita"></div>
                <div class="story-list" role="list" aria-label="Daftar cerita"></div>
            </div>
        `;

        await this.initMap(container);
        return container;
    }

    async initMap(container) {
        const mapEl = container.querySelector("#map");
        const listEl = container.querySelector(".story-list");

        // Cleanup existing map if any
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.markers = [];
        }

        // Clear map container
        mapEl.innerHTML = '';

        this.stories = await apiModel.getStories();

        // Inisialisasi Leaflet map
        this.map = L.map(mapEl).setView([-2.5, 118], 5);

        // Base layer
        const tile1 = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
        }).addTo(this.map);

        const tile2 = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenTopoMap contributors",
        });

        // Layer control
        L.control.layers({ "Street Map": tile1, "Topo Map": tile2 }).addTo(this.map);

        // Render daftar story dengan tombol favorite
        await this.renderStoryList(listEl);

        // Tambahkan marker ke peta
        this.stories.forEach((story, i) => {
            if (story.lat && story.lon) {
                const marker = L.marker([story.lat, story.lon])
                    .addTo(this.map)
                    .bindPopup(`<b>${story.name}</b><br>${story.description}`);
                this.markers.push(marker);
            }
        });

        // Interaksi antara daftar dan marker
        listEl.addEventListener("click", async (e) => {
            const item = e.target.closest(".story-item");
            const favoriteBtn = e.target.closest(".btn-favorite");

            if (favoriteBtn) {
                e.stopPropagation();
                await this.toggleFavorite(favoriteBtn.dataset.id);
                await this.renderStoryList(listEl);
                return;
            }

            if (!item) return;
            const index = item.dataset.index;
            const story = this.stories[index];

            if (story.lat && story.lon) {
                this.map.flyTo([story.lat, story.lon], 10);
                this.markers[index].openPopup();
            }

            container
                .querySelectorAll(".story-item")
                .forEach((el) => el.classList.remove("active"));
            item.classList.add("active");
        });

        // Aksesibilitas tambahan: navigasi keyboard
        listEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const item = e.target.closest(".story-item");
                if (item) item.click();
            }
        });
    }

    async renderStoryList(listEl) {
        const favorites = await favoriteDB.getAllFavorites();
        const favoriteIds = new Set(favorites.map(fav => fav.id));

        listEl.innerHTML = this.stories
            .map(
                (story, index) => `
            <div
                class="story-item"
                data-index="${index}"
                role="listitem"
                tabindex="0"
                aria-label="Cerita oleh ${story.name}"
            >
                <img
                    src="${story.photoUrl}"
                    alt="Foto cerita oleh ${story.name}"
                    class="story-img"
                    loading="lazy"
                />
                <div class="story-content">
                    <h3 class="story-title">${story.name}</h3>
                    <p class="story-desc">${story.description}</p>
                    <p class="story-date">${new Date(story.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                    class="btn-favorite ${favoriteIds.has(story.id) ? 'favorited' : ''}"
                    data-id="${story.id}"
                    aria-label="${favoriteIds.has(story.id) ? 'Remove from favorites' : 'Add to favorites'}"
                >
                    ${favoriteIds.has(story.id) ? '❤️' : '🤍'}
                </button>
            </div>
            `
            )
            .join("");
    }

    async toggleFavorite(storyId) {
        const story = this.stories.find(s => s.id === storyId);
        if (!story) return;

        const favorites = await favoriteDB.getAllFavorites();
        const isFavorited = favorites.some(fav => fav.id === storyId);

        try {
            if (isFavorited) {
                await favoriteDB.deleteFavorite(storyId);
                console.log("Removed from favorites:", story.name);
            } else {
                const favoriteData = {
                    id: story.id,
                    name: story.name,
                    description: story.description,
                    photoUrl: story.photoUrl,
                    lat: story.lat,
                    lon: story.lon,
                    createdAt: story.createdAt || new Date().toISOString(),
                };
                await favoriteDB.addFavorite(favoriteData);
                console.log("Added to favorites:", story.name);
            }
        } catch (error) {
            console.error("Error toggling favorite:", error);
            alert("Failed to update favorites");
        }
    }
}
