export class PagePresenter {
    constructor(view) {
        this.view = view;
    }

    async getView() {
        // Render elemen tampilan
        const viewElement = await this.view.render();

        // Jalankan afterRender() setelah elemen sudah ada di DOM
        // (router akan appendChild-nya lebih dulu)
        setTimeout(() => {
            if (typeof this.view.afterRender === "function") {
                this.view.afterRender();
            }
        }, 0);

        return viewElement;
    }
}
