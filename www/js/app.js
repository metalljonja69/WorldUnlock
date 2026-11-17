if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch((error) => {
        console.error('Service Worker konnte nicht registriert werden.', error);
      });
  });
}

const menu = document.querySelector("#side-menu");
const menuButton = document.querySelector("#menu-button");
const closeMenuButton = document.querySelector("#close-menu-button");
const menuBackdrop = document.querySelector("#menu-backdrop");
const clearDataButton = document.querySelector("#clear-data-button");
const exportDataButton = document.querySelector("#export-data-button");
const importDataInput = document.querySelector("#import-data-input");
const menuTabs = document.querySelectorAll(".menu-tab");
const menuPanels = document.querySelectorAll("[data-menu-panel]");

function setMenuOpen(isOpen) {
  menu.classList.toggle("is-open", isOpen);
  menu.setAttribute("aria-hidden", String(!isOpen));
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuBackdrop.hidden = !isOpen;
}

menuButton.addEventListener("click", () => setMenuOpen(true));
closeMenuButton.addEventListener("click", () => setMenuOpen(false));
menuBackdrop.addEventListener("click", () => setMenuOpen(false));

menuTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    menuTabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    menuPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.menuPanel === tab.dataset.menuTab);
    });
  });
});

clearDataButton.addEventListener("click", () => {
  if (
    !window.confirm(
      "Möchtest du wirklich alle gespeicherten Erkundungen und Statistiken löschen?",
    )
  ) {
    return;
  }

  window.stopTracking();
  window.clearLocationMarker();
  window.clearStoredData();
  window.updateStatistics();
  setMenuOpen(false);
});

exportDataButton.addEventListener("click", () => {
  window.exportStoredData();
});

importDataInput.addEventListener("change", async () => {
  const file = importDataInput.files?.[0];
  if (!file) return;
  try {
    await window.importStoredData(file);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Import fehlgeschlagen.");
  } finally {
    importDataInput.value = "";
  }
});
