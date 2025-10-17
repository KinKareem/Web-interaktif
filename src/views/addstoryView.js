import { apiModel } from "../models/apiModel.js";

export default class AddStoryView {
  render() {
    const div = document.createElement("div");
    div.className = "page page-add-story";
    div.setAttribute("role", "region");
    div.setAttribute("aria-labelledby", "add-story-title");

    div.innerHTML = `
      <h1 id="add-story-title" tabindex="0">Tambah Cerita Baru</h1>

      <form id="addStoryForm" class="add-story-form" aria-describedby="form-desc">
        <p id="form-desc" class="sr-only"></p>

        <div class="form-group">
          <label for="description">Deskripsi Cerita</label>
          <textarea 
            id="description" 
            name="description" 
            placeholder="Tuliskan deskripsi..." 
            aria-required="true"
            required
          ></textarea>
        </div>

        <div class="form-group">
          <label for="photo">Upload Gambar</label>
          <input 
            type="file" 
            id="photo" 
            name="photo" 
            accept="image/*" 
            aria-required="true"
            required
          >
        </div>

        <div class="form-group" role="group" aria-labelledby="map-label">
          <label id="map-label">Pilih Lokasi di Peta</label>
          <div id="map" role="application" aria-label="Peta untuk memilih lokasi cerita"></div>
          <p id="location-info" aria-live="polite">Belum ada lokasi dipilih.</p>
        </div>

        <button 
          type="submit" 
          class="btn-submit"
          aria-label="Kirim Cerita"
        >
          Kirim Cerita
        </button>
      </form>
    `;

    // Pastikan peta diinisialisasi setelah elemen dimasukkan ke DOM
    setTimeout(() => this.initMap(), 100);
    return div;
  }

  async initMap() {
    const mapContainer = document.getElementById("map");
    if (!mapContainer) return;

    const map = L.map("map").setView([-2.5489, 118.0149], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    let marker;
    const locationInfo = document.getElementById("location-info");

    map.on("click", (e) => {
      const { lat, lng } = e.latlng;

      if (marker) map.removeLayer(marker);
      marker = L.marker([lat, lng]).addTo(map);

      locationInfo.textContent = `Lokasi dipilih: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      locationInfo.dataset.lat = lat;
      locationInfo.dataset.lng = lng;
    });

    // Tangani submit form
    const form = document.getElementById("addStoryForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const lat = locationInfo.dataset.lat;
      const lon = locationInfo.dataset.lng;

      if (!lat || !lon) {
        alert("Silakan pilih lokasi di peta terlebih dahulu!");
        return;
      }

      formData.append("lat", lat);
      formData.append("lon", lon);

      // Try to submit online first
      const result = await apiModel.addStory(formData);

      if (result.error) {
        // If online submission fails, save offline
        if (!navigator.onLine) {
          try {
            const { favoriteDB } = await import("../db/favorite-db.js");
            await favoriteDB.addOfflineStory(formData);
            alert("📱 Cerita disimpan offline. Akan disinkronkan saat online.");
            window.location.hash = "/";
          } catch (offlineErr) {
            console.error("❌ Gagal menyimpan offline:", offlineErr);
            alert("❌ Gagal menambahkan cerita dan tidak dapat menyimpan offline.");
          }
        } else {
          alert("❌ Gagal menambahkan cerita: " + result.message);
        }
      } else {
        alert("✅ Cerita berhasil ditambahkan!");
        window.location.hash = "#/map";
      }
    });
  }
}
