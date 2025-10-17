import { dataModel } from "../models/dataModel.js";

export default class ContactView {
    render() {
        const div = document.createElement("div");
        div.className = "page page-contact";
        div.setAttribute("role", "region");
        div.setAttribute("aria-labelledby", "contact-title");

        div.innerHTML = `
            <h1 id="contact-title" class="page-title" tabindex="0">Contact</h1>
            <p class="page-text" aria-label="Informasi kontak">${dataModel.contact}</p>
        `;
        return div;
    }
}
