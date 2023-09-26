import {actorCreator} from "./ActorCreator.js";

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
    html[0].querySelector(".import-button").addEventListener("click", event => {
      return actorCreator(this.element[0].querySelector("[name=text]").value);
    });
  }
}
