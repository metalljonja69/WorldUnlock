(function (global) {
  "use strict";

  const clearButton = document.querySelector("#clear-data-button");
  const exportButton = document.querySelector("#export-data-button");
  const importInput = document.querySelector("#import-data-input");

  clearButton.addEventListener("click", () => {
    if (!window.confirm("Möchtest du wirklich alle gespeicherten Erkundungen und Statistiken löschen?")) {
      return;
    }
    if (typeof global.stopTracking === "function") global.stopTracking();
    if (typeof global.clearLocationMarker === "function") global.clearLocationMarker();
    if (typeof global.clearStoredData === "function") global.clearStoredData();
    if (typeof global.updateStatistics === "function") global.updateStatistics();
    global.WorldUnlockNavigation?.setOpen(false);
  });

  exportButton.addEventListener("click", () => {
    if (typeof global.exportStoredData === "function") global.exportStoredData();
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      await global.importStoredData(file);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    } finally {
      importInput.value = "";
    }
  });

  global.WorldUnlockSettings = Object.freeze({});
})(window);
