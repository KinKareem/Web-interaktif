import { apiModel } from "../models/apiModel.js";

class RegisterPage {
    async render() {
        const container = document.createElement("section");
        container.classList.add("auth-section");
        container.innerHTML = `
      <h2>Register</h2>
      <form id="registerForm" class="auth-form">
        <input type="text" id="name" name="name" placeholder="Nama Lengkap" required />
        <input type="email" id="email" name="email" placeholder="Email" required />
        <input type="password" id="password" name="password" placeholder="Password" required minlength="8" />
        <button type="submit">Daftar</button>
      </form>
      <p>Sudah punya akun? <a href="#/login">Login di sini</a></p>
    `;
        return container;
    }

    async afterRender() {
        console.log("✅ RegisterPage.afterRender() terpanggil!");

        const form = document.getElementById("registerForm");
        if (!form) {
            console.error("❌ Elemen form tidak ditemukan!");
            return;
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            // Ambil nilai input dengan cara yang aman
            const name = document.querySelector("#name").value.trim();
            const email = document.querySelector("#email").value.trim();
            const password = document.querySelector("#password").value.trim();

            if (!name || !email || !password) {
                alert("Semua kolom wajib diisi!");
                return;
            }

            // Tampilkan indikator loading sederhana
            const button = form.querySelector("button");
            button.disabled = true;
            button.textContent = "Mendaftar...";

            try {
                const result = await apiModel.register(name, email, password);

                alert(result.message);
                if (result.success) {
                    window.location.hash = "#/login";
                }
            } catch (err) {
                console.error("⚠️ Terjadi kesalahan saat register:", err);
                alert("Terjadi kesalahan. Coba lagi nanti.");
            } finally {
                button.disabled = false;
                button.textContent = "Daftar";
            }
        });
    }
}

export default RegisterPage;
