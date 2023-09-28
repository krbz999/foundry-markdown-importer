import {MarkDownParserClass} from "./data-model.mjs";

class ImportWindow extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "md-importer",
      template: "modules/foundry-markdown-importer/templates/importer.hbs",
      resizable: false,
      height: "auto",
      width: 400,
      title: "Markdown Importer"
    });
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const reader = new FileReader();
    html[0].querySelector(".import-button").addEventListener("click", this._onUpload.bind(reader));
    reader.addEventListener("load", this._onLoad.bind(this, reader));
  }

  _onUpload(event) {
    const file = event.currentTarget.previousElementSibling.files.item(0);
    if (file) this.readAsText(file);
  }

  _onLoad(reader) {
    const data = JSON.parse(reader.result);
    return new MarkDownParserClass(data);
  }
}

Hooks.on("renderActorDirectory", async (app, html) => {
  const div = document.createElement("DIV");
  div.innerHTML = `
  <button class="import-markdown">
    <i class="fa-solid fa-file-import"></i> Markdown Import
  </button>`;
  div.querySelector("BUTTON").addEventListener("click", () => new ImportWindow().render(true));
  html[0].querySelector(".directory-footer").append(div.firstElementChild);
});
