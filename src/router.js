import { PagePresenter } from "./presenters/pagePresenter.js";
import HomeView from "./views/homeView.js";
import AboutView from "./views/aboutView.js";
import ContactView from "./views/contactView.js";
import MapView from "./views/mapView.js";
import AddStoryView from "./views/addstoryView.js";
import FavoritesView from "./views/favoritesView.js";
import LoginPage from "./views/login-page.js";
import RegisterPage from "./views/register-page.js";
import { apiModel } from "./models/apiModel.js";

const routes = {
    "/": HomeView,
    "/about": AboutView,
    "/contact": ContactView,
    "/map": MapView,
    "/add-story": AddStoryView,
    "/favorites": FavoritesView,
    "/login": LoginPage,
    "/register": RegisterPage,
};

/* ==============================
   🔧 Fungsi Update Navbar Dinamis
============================== */
function updateNavbarUI() {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;

    // cari atau buat div kanan untuk tombol login/logout
    let navRight = navbar.querySelector(".nav-right");
    if (!navRight) {
        navRight = document.createElement("div");
        navRight.classList.add("nav-right");
        navbar.appendChild(navRight);
    }

    // kosongkan dulu
    navRight.innerHTML = "";

    if (apiModel.isLoggedIn()) {
        // Jika sudah login → tampilkan tombol Logout
        const logoutBtn = document.createElement("a");
        logoutBtn.href = "#/login";
        logoutBtn.textContent = "Logout";
        logoutBtn.classList.add("nav-link");

        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            apiModel.logout();
            window.location.hash = "#/login";
            updateNavbarUI(); // refresh tampilan navbar
        });

        navRight.appendChild(logoutBtn);
    } else {
        // Jika belum login → tampilkan tombol Login & Register
        const loginBtn = document.createElement("a");
        loginBtn.href = "#/login";
        loginBtn.textContent = "Login";
        loginBtn.classList.add("nav-link");

        const registerBtn = document.createElement("a");
        registerBtn.href = "#/register";
        registerBtn.textContent = "Register";
        registerBtn.classList.add("nav-link");

        navRight.appendChild(loginBtn);
        navRight.appendChild(registerBtn);
    }
}

/* ==============================
   🚦 Router SPA
============================== */
export function initRouter() {
    window.addEventListener("hashchange", renderPage);
    renderPage(); // Initial render
}

async function renderPage() {
    const app = document.getElementById("app");
    const path = location.hash.slice(1).toLowerCase() || "/";

    const publicRoutes = ["/login", "/register"];
    const isPublic = publicRoutes.includes(path);

    // jika belum login & bukan di halaman publik
    if (!isPublic && !apiModel.isLoggedIn()) {
        console.warn("🔒 Pengguna belum login, mengarahkan ke /login...");
        window.location.hash = "#/login";
        return;
    }

    // jika sudah login & mencoba akses login/register
    if (isPublic && apiModel.isLoggedIn()) {
        window.location.hash = "#/";
        return;
    }

    const Page = routes[path] || HomeView;

    // Use View Transition API if supported
    if (document.startViewTransition) {
        const transition = document.startViewTransition(async () => {
            app.innerHTML = "";

            const pageInstance = new Page();
            const presenter = new PagePresenter(pageInstance);
            const view = await presenter.getView();

            if (view) {
                view.classList.add("view-transition");
                app.appendChild(view);

                // Pastikan afterRender() terpanggil jika ada
                if (pageInstance.afterRender) {
                    await pageInstance.afterRender();
                }
            } else {
                console.error("View tidak ditemukan untuk route:", path);
            }
        });

        // Update navbar after transition
        transition.finished.then(() => {
            updateNavbarUI();
        });
    } else {
        // Fallback for browsers without View Transition API
        app.innerHTML = "";

        const pageInstance = new Page();
        const presenter = new PagePresenter(pageInstance);
        const view = await presenter.getView();

        if (view) {
            view.classList.add("view-transition");
            app.appendChild(view);

            // Pastikan afterRender() terpanggil jika ada
            if (pageInstance.afterRender) {
                await pageInstance.afterRender();
            }
        } else {
            console.error("View tidak ditemukan untuk route:", path);
        }

        // Update tombol navbar sesuai status login
        updateNavbarUI();
    }
}

