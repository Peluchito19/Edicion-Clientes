(() => {
  const CONTAINER_ID = "sistema-menu-container";
  const PAPAPARSE_URL =
    "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js";
  const SHEET_TIMEOUT_MS = 3000;

  const SCRIPT_EL = document.currentScript;
  if (!SCRIPT_EL) {
    return;
  }

  const sheetId = SCRIPT_EL.getAttribute("data-sheet-id");
  const backupUrl = SCRIPT_EL.getAttribute("data-backup-url");
  const container = document.getElementById(CONTAINER_ID);

  if (!sheetId || !backupUrl || !container) {
    return;
  }

  const injectStyles = () => {
    if (document.getElementById("sistema-menu-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "sistema-menu-styles";
    style.textContent = `
      .sistema-menu-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.25rem}
      .sistema-menu-card{background:#fff;border-radius:0.75rem;box-shadow:0 10px 20px rgba(15,23,42,.08);overflow:hidden;display:flex;flex-direction:column;transition:transform .2s ease,box-shadow .2s ease}
      .sistema-menu-card:hover{transform:translateY(-4px);box-shadow:0 16px 28px rgba(15,23,42,.12)}
      .sistema-menu-image{width:100%;height:180px;object-fit:cover;background:#f1f5f9}
      .sistema-menu-body{padding:1rem 1.1rem 1.25rem;display:flex;flex-direction:column;gap:0.5rem}
      .sistema-menu-title{font-size:1.05rem;font-weight:600;color:#0f172a}
      .sistema-menu-desc{font-size:.9rem;color:#475569;line-height:1.4}
      .sistema-menu-price{margin-top:auto;font-weight:700;color:#0f172a;font-size:1rem}
      .opacity-50{opacity:.5}
      .sistema-menu-soldout-badge{margin-top:.5rem;align-self:flex-start;background:#fee2e2;color:#991b1b;font-weight:600;font-size:.75rem;padding:.2rem .5rem;border-radius:999px}
    `;
    document.head.appendChild(style);
  };

  const loadPapaParse = () =>
    new Promise((resolve, reject) => {
      if (window.Papa && typeof window.Papa.parse === "function") {
        resolve(window.Papa);
        return;
      }
      const script = document.createElement("script");
      script.src = PAPAPARSE_URL;
      script.async = true;
      script.onload = () => resolve(window.Papa);
      script.onerror = () =>
        reject(new Error("No se pudo cargar PapaParse."));
      document.head.appendChild(script);
    });

  const fetchWithTimeout = (url, timeoutMs) =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      fetch(url, { signal: controller.signal })
        .then((response) => {
          clearTimeout(timer);
          if (!response.ok) {
            reject(new Error(`Respuesta inválida (${response.status})`));
            return;
          }
          resolve(response);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });

  const normalizeKey = (key) =>
    key
      ? key
          .toString()
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      : "";

  const normalizeId = (value) =>
    normalizeKey(value).replace(/\s+/g, "");

  const toMenuItem = (row) => {
    const normalized = {};
    Object.keys(row || {}).forEach((key) => {
      normalized[normalizeKey(key)] = row[key];
    });

    return {
      id:
        normalized.id ||
        normalized["producto id"] ||
        normalized["producto_id"] ||
        "",
      nombre: normalized.nombre || normalized.name || "",
      descripcion: normalized.descripcion || normalized.description || "",
      precio: normalized.precio || normalized.price || "",
      imagen: normalized.imagen || normalized.image || normalized.foto || "",
      disponible: normalized.disponible || normalized.available || "SI",
    };
  };

  const renderMenu = (items) => {
    injectStyles();
    container.innerHTML = "";
    container.classList.add("sistema-menu-grid");

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "sistema-menu-card";

      if (item.imagen) {
        const img = document.createElement("img");
        img.className = "sistema-menu-image";
        img.alt = item.nombre || "Imagen de producto";
        img.src = item.imagen;
        card.appendChild(img);
      }

      const body = document.createElement("div");
      body.className = "sistema-menu-body";

      const title = document.createElement("div");
      title.className = "sistema-menu-title";
      title.textContent = item.nombre;

      const desc = document.createElement("div");
      desc.className = "sistema-menu-desc";
      desc.textContent = item.descripcion;

      const price = document.createElement("div");
      price.className = "sistema-menu-price";
      price.textContent = item.precio;

      body.appendChild(title);
      if (item.descripcion) {
        body.appendChild(desc);
      }
      if (item.precio) {
        body.appendChild(price);
      }

      card.appendChild(body);
      container.appendChild(card);
    });
  };

  const syncHybridMenu = (items) => {
    const nodes = Array.from(
      document.querySelectorAll("[data-producto-id]")
    );
    if (nodes.length === 0) {
      return false;
    }

    injectStyles();

    const itemMap = new Map(
      items
        .filter((item) => item.id)
        .map((item) => [normalizeId(item.id), item])
    );

    nodes.forEach((node) => {
      const rawId = node.getAttribute("data-producto-id");
      const match = itemMap.get(normalizeId(rawId));
      if (!match) {
        return;
      }

      const priceEl = node.querySelector(".precio");
      if (priceEl && match.precio) {
        priceEl.textContent = match.precio;
      }

      const isUnavailable =
        normalizeKey(match.disponible) === "no" ||
        normalizeKey(match.disponible) === "false";

      if (isUnavailable) {
        node.classList.add("opacity-50");
        let badge = node.querySelector(".sistema-menu-soldout-badge");
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "sistema-menu-soldout-badge";
          badge.textContent = "Agotado";
          node.appendChild(badge);
        }
      } else {
        node.classList.remove("opacity-50");
        const badge = node.querySelector(".sistema-menu-soldout-badge");
        if (badge) {
          badge.remove();
        }
      }
    });

    return true;
  };

  const parseCsv = async (csvText) => {
    const Papa = await loadPapaParse();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data || []),
        error: (error) => reject(error),
      });
    });
  };

  const loadFromSheet = async () => {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv`;
    const response = await fetchWithTimeout(csvUrl, SHEET_TIMEOUT_MS);
    return response.text();
  };

  const loadBackup = async () => {
    const response = await fetch(backupUrl);
    if (!response.ok) {
      throw new Error(`Backup inválido (${response.status})`);
    }
    return response.json();
  };

  const init = async () => {
    try {
      const csvText = await loadFromSheet();
      const rows = await parseCsv(csvText);
      const items = rows.map(toMenuItem);
      const hasHybrid = syncHybridMenu(items);
      if (!hasHybrid) {
        const disponibles = items.filter(
          (item) =>
            normalizeKey(item.disponible) !== "no" &&
            normalizeKey(item.disponible) !== "false"
        );
        renderMenu(disponibles);
      }
    } catch (error) {
      try {
        const backupData = await loadBackup();
        const rows = Array.isArray(backupData)
          ? backupData
          : backupData.items || [];
        const items = rows.map(toMenuItem);
        const hasHybrid = syncHybridMenu(items);
        if (!hasHybrid) {
          const disponibles = items.filter(
            (item) =>
              normalizeKey(item.disponible) !== "no" &&
              normalizeKey(item.disponible) !== "false"
          );
          renderMenu(disponibles);
        }
      } catch (_backupError) {
        container.innerHTML =
          "<p>No fue posible cargar el menú en este momento.</p>";
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
