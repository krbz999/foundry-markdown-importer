import ImportWindow from "./ImportWindow.js";

Hooks.on("renderActorDirectory", async (app, html) => {
  const div = document.createElement("DIV");
  div.innerHTML = `
  <button class="import-markdown">
    <i class="fa-solid fa-file-import"></i> Markdown Import
  </button>`;
  div.querySelector("BUTTON").addEventListener("click", () => new ImportWindow().render(true));
  html[0].querySelector(".directory-footer").append(div.firstElementChild);
});
