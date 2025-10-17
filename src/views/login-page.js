import { apiModel } from "../models/apiModel.js";

class LoginPage {
    async render() {
        const container = document.createElement("section");
        container.classList.add("auth-section");
        container.innerHTML = `
      <h2>Login</h2>
      <form id="loginForm" class="auth-form">
        <input type="email" id="email" name="email" placeholder="Email" required />
        <input type="password" id="password" name="password" placeholder="Password" required />
        <button type="submit">Login</button>
      </form>
      <p>Belum punya akun? <a href="#/register">Daftar di sini</a></p>
    `;
        return container;
    }

    async afterRender() {
        console.log("✅ LoginPage.afterRender() terpanggil!");

        const form = document.getElementById("loginForm");
        if (!form) {
            console.error("❌ Elemen form login tidak ditemukan!");
            return;
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            // Ambil nilai input secara aman
            const email = document.querySelector("#email").value.trim();
            const password = document.querySelector("#password").value.trim();

            if (!email || !password) {
                alert("Email dan password wajib diisi!");
                return;
            }

            // Feedback loading
            const button = form.querySelector("button");
            button.disabled = true;
            button.textContent = "Masuk...";

            try {
                const result = await apiModel.login(email, password);

                alert(result.message);
                if (result.success) {
                    window.location.hash = "#/"; // arahkan ke halaman utama
                }
            } catch (err) {
                console.error("⚠️ Terjadi kesalahan saat login:", err);
                alert("Terjadi kesalahan. Coba lagi nanti.");
            } finally {
                button.disabled = false;
                button.textContent = "Login";
            }
        });
    }
}

export default LoginPage;
