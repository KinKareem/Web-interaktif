import { favoriteDB } from "../db/favorite-db.js";
import { apiModel } from "../models/apiModel.js";

export default class FavoritesView {
    constructor() {
        this.favorites = [];
        this.filteredFavorites = [];
        this.searchQuery = "";
        this.sortOrder = "desc"; // desc or asc
        this.sortBy = "date"; // date or name
    }

    render() {
        const div = document.createElement("div");
        div.className = "page page-favorites";
        div.setAttribute("role", "region");
        div.setAttribute("aria-labelledby", "favorites-title");

        div.innerHTML = `
            <h1 id="favorites-title" class="page-title" tabindex="0">My Favorites</h1>

            <div class="favorites-controls">
                <div class="search-container">
                    <input
                        type="text"
                        id="search-favorites"
                        placeholder="Search favorites..."
                        aria-label="Search favorites"
                    >
                    <button id="clear-search" class="btn-clear">Clear</button>
                </div>

                <div class="sort-controls">
                    <label for="sort-by">Sort by:</label>
                    <select id="sort-by" aria-label="Sort favorites by">
                        <option value="date">Date</option>
                        <option value="name">Name</option>
                    </select>

                    <label for="sort-order">Order:</label>
                    <select id="sort-order" aria-label="Sort order">
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                    </select>
                </div>
            </div>

            <div id="favorites-list" class="favorites-list" role="list" aria-label="List of favorite stories">
                <p class="loading">Loading favorites...</p>
            </div>
        `;

        return div;
    }

    async afterRender() {
        await this.loadFavorites();

        // Search functionality
        const searchInput = document.getElementById("search-favorites");
        const clearBtn = document.getElementById("clear-search");
        const sortBySelect = document.getElementById("sort-by");
        const sortOrderSelect = document.getElementById("sort-order");

        searchInput.addEventListener("input", (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.applyFilters();
        });

        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            this.searchQuery = "";
            this.applyFilters();
        });

        sortBySelect.addEventListener("change", (e) => {
            this.sortBy = e.target.value;
            this.applyFilters();
        });

        sortOrderSelect.addEventListener("change", (e) => {
            this.sortOrder = e.target.value;
            this.applyFilters();
        });
    }

    async loadFavorites() {
        try {
            this.favorites = await favoriteDB.getAllFavorites();
            this.applyFilters();
        } catch (error) {
            console.error("Error loading favorites:", error);
            this.showError("Failed to load favorites");
        }
    }

    applyFilters() {
        let filtered = [...this.favorites];

        // Apply search by name only
        if (this.searchQuery) {
            filtered = filtered.filter(story =>
                story.name.toLowerCase().includes(this.searchQuery)
            );
        }

        // Apply sorting
        if (this.sortBy === "date") {
            filtered.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return this.sortOrder === "desc" ? dateB - dateA : dateA - dateB;
            });
        } else if (this.sortBy === "name") {
            filtered.sort((a, b) => {
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                if (this.sortOrder === "asc") {
                    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
                } else {
                    return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
                }
            });
        }

        this.filteredFavorites = filtered;
        this.renderFavoritesList();
    }

    renderFavoritesList() {
        const container = document.getElementById("favorites-list");

        if (this.filteredFavorites.length === 0) {
            if (this.favorites.length === 0) {
                container.innerHTML = '<p class="empty-state">No favorites yet. Add some stories to your favorites!</p>';
            } else {
                container.innerHTML = '<p class="empty-state">No favorites match your search.</p>';
            }
            return;
        }

        container.innerHTML = this.filteredFavorites.map(story => `
            <div class="favorite-item" role="listitem" data-id="${story.id}">
                <img 
                    src="${this.escapeHtml(story.photoUrl)}" 
                    alt="Foto favorit ${this.escapeHtml(story.name)}" 
                    class="favorite-img" 
                    loading="lazy"
                />
                <div class="favorite-content">
                    <h3 class="favorite-title">${this.escapeHtml(story.name)}</h3>
                    <p class="favorite-description">${this.escapeHtml(story.description)}</p>
                    <small class="favorite-date">
                        Created: ${new Date(story.createdAt).toLocaleDateString()}
                    </small>
                </div>
                <div class="favorite-actions">
                    <button class="btn-remove-favorite" data-id="${story.id}" aria-label="Remove from favorites">
                        Remove
                    </button>
                </div>
            </div>
        `).join("");

        // Add event listeners for remove buttons
        container.querySelectorAll(".btn-remove-favorite").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                await this.removeFavorite(id);
            });
        });
    }

    async removeFavorite(id) {
        try {
            await favoriteDB.deleteFavorite(id);
            await this.loadFavorites(); // Reload the list
            console.log("Favorite removed:", id);
        } catch (error) {
            console.error("Error removing favorite:", error);
            alert("Failed to remove favorite");
        }
    }

    showError(message) {
        const container = document.getElementById("favorites-list");
        container.innerHTML = `<p class="error-state">${message}</p>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
