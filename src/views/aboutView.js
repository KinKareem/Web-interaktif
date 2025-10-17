import { dataModel } from "../models/dataModel.js";

export default class AboutView {
    render() {
        const div = document.createElement("div");
        div.className = "page page-about";
        div.setAttribute("role", "region");
        div.setAttribute("aria-labelledby", "about-title");
        div.innerHTML = `
      <h1 id="about-title" class="page-title" tabindex="0">About</h1>
      <p class="page-text" tabindex="0">${dataModel.about}</p>
    `;
        return div;
    }
}
