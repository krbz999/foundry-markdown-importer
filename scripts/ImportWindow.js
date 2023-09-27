import {MarkDownParserClass} from "./data-model.mjs";


export default class ImportWindow extends Application {
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
