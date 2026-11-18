(function (global) {
  "use strict";

  const menu = document.querySelector("#side-menu");
  const menuButton = document.querySelector("#menu-button");
  const closeButton = document.querySelector("#close-menu-button");
  const backdrop = document.querySelector("#menu-backdrop");
  const menuTabs = [...document.querySelectorAll(".menu-tab")];
  const panels = [...document.querySelectorAll("[data-menu-panel]")];
  const triggers = [...document.querySelectorAll("[data-menu-tab]")];
  const bottomButtons = [...document.querySelectorAll(".bottom-navigation [data-menu-tab]")];

  function setOpen(isOpen) {
    menu.classList.toggle("is-open", isOpen);
    menu.setAttribute("aria-hidden", String(!isOpen));
    menuButton.setAttribute("aria-expanded", String(isOpen));
    backdrop.hidden = !isOpen;
  }

  function activate(tabName) {
    if (tabName === "map") {
      setOpen(false);
      document.querySelector(".map-card")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      tabName = "map";
    }

    menuTabs.forEach((tab) => {
      const active = tab.dataset.menuTab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.menuPanel === tabName);
    });
    bottomButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.menuTab === tabName);
    });
  }

  function open(tabName) {
    activate(tabName);
    setOpen(tabName !== "map");
  }

  menuButton.addEventListener("click", () => open("settings"));
  closeButton.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => open(trigger.dataset.menuTab));
  });

  global.WorldUnlockNavigation = Object.freeze({
    activate,
    open,
    setOpen,
  });

  activate("map");
})(window);
