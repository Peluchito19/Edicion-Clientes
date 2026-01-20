(() => {
  const PAPAPARSE_URL =
    "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js";

  const SCRIPT_EL = document.currentScript;
  if (!SCRIPT_EL) {
    return;
  }

  const menuSheetId = SCRIPT_EL.getAttribute("data-sheet-id");
  const agregadosSheetId = SCRIPT_EL.getAttribute("data-sheet-agregados-id");

  if (!menuSheetId && !agregadosSheetId) {
    return;
  }

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

  const formatCLP = (value) => {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const digits = value.toString().replace(/[^\d]/g, "");
    if (!digits) {
      return value.toString();
    }
    const numberValue = Number(digits);
    if (Number.isNaN(numberValue)) {
      return value.toString();
    }
    return `$${numberValue.toLocaleString("es-CL", {
      maximumFractionDigits: 0,
    })}`;
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

  const buildCsvUrl = (value) => {
    if (!value) {
      return "";
    }
    const trimmed = value.trim();
    if (trimmed.startsWith("http")) {
      return trimmed;
    }
    return `https://docs.google.com/spreadsheets/d/${trimmed}/pub?output=csv`;
  };

  const fetchCsv = async (sheetIdOrUrl) => {
    const csvUrl = buildCsvUrl(sheetIdOrUrl);
    if (!csvUrl) {
      return "";
    }
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Respuesta inválida (${response.status})`);
    }
    return response.text();
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

  const getSizePrice = (normalized, keys) => {
    for (const key of keys) {
      if (normalized[key]) {
        return normalized[key];
      }
    }
    return "";
  };

  const toMenuItem = (row) => {
    const normalized = {};
    Object.keys(row || {}).forEach((key) => {
      normalized[normalizeKey(key)] = row[key];
    });

    const sizePrices = {
      ind: getSizePrice(normalized, [
        "precio ind",
        "precio_ind",
        "precio individual",
        "precio_individual",
        "ind",
      ]),
      fam: getSizePrice(normalized, [
        "precio fam",
        "precio_fam",
        "precio familiar",
        "precio_familiar",
        "fam",
      ]),
      xl: getSizePrice(normalized, ["precio xl", "precio_xl", "xl"]),
    };

    return {
      id:
        normalized.id ||
        normalized["producto id"] ||
        normalized["producto_id"] ||
        "",
      precio: normalized.precio || normalized.price || "",
      sizePrices,
    };
  };

  const buildItemMap = (rows) =>
    new Map(
      rows
        .map(toMenuItem)
        .filter((item) => item.id)
        .map((item) => [normalizeId(item.id), item])
    );

  const mergeMaps = (primary, secondary) => {
    const merged = new Map(primary);
    secondary.forEach((value, key) => {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    });
    return merged;
  };

  const getPriceForSize = (item, sizeKey) => {
    if (sizeKey && item.sizePrices[sizeKey]) {
      return item.sizePrices[sizeKey];
    }
    return item.precio || "";
  };

  let itemMap = new Map();

  const splitSizeFromId = (normalizedId) => {
    const parts = normalizedId.split("-");
    const last = parts[parts.length - 1];
    if (last === "ind" || last === "fam" || last === "xl") {
      return {
        baseId: parts.slice(0, -1).join("-"),
        sizeKey: last,
      };
    }
    return { baseId: normalizedId, sizeKey: "" };
  };

  const isUpdatableElement = (node) => {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    const tag = node.tagName.toLowerCase();
    if (["button", "input", "select", "textarea"].includes(tag)) {
      return false;
    }
    return node.children.length === 0;
  };

  const updateNodePrice = (node) => {
    if (!isUpdatableElement(node)) {
      return;
    }
    const rawId = node.getAttribute("data-producto-id");
    const normalizedId = normalizeId(rawId);
    const exactMatch = itemMap.get(normalizedId);
    const { baseId, sizeKey } = splitSizeFromId(normalizedId);
    const match = exactMatch || itemMap.get(baseId);
    if (!match) {
      return;
    }

    const rawPrice = getPriceForSize(match, sizeKey);
    if (!rawPrice) {
      return;
    }
    node.textContent = formatCLP(rawPrice);
  };

  const refreshAllPrices = (root = document) => {
    const nodes = Array.from(root.querySelectorAll("[data-producto-id]"));
    nodes.forEach((node) => updateNodePrice(node));
  };

  const findPriceContainer = (startNode) => {
    let current = startNode;
    while (current && current !== document.body) {
      if (
        current.querySelector(
          "[data-producto-id].precio-valor, [data-producto-id].precio"
        )
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  const detectSizeKey = (text) => {
    const normalized = normalizeKey(text);
    if (normalized.includes("ind")) {
      return "ind";
    }
    if (normalized.includes("fam")) {
      return "fam";
    }
    if (normalized.includes("xl")) {
      return "xl";
    }
    return "";
  };

  const onSizeClick = (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }
    const sizeKey = detectSizeKey(button.textContent);
    if (!sizeKey) {
      return;
    }
    const container = findPriceContainer(button);
    if (!container) {
      return;
    }
    setTimeout(() => {
      refreshAllPrices(container);
    }, 0);
  };

  const init = async () => {
    try {
      const [menuCsv, agregadosCsv] = await Promise.all([
        fetchCsv(menuSheetId),
        fetchCsv(agregadosSheetId),
      ]);
      const [menuRows, agregadosRows] = await Promise.all([
        menuCsv ? parseCsv(menuCsv) : [],
        agregadosCsv ? parseCsv(agregadosCsv) : [],
      ]);
      const menuMap = buildItemMap(menuRows);
      const agregadosMap = buildItemMap(agregadosRows);
      itemMap = mergeMaps(menuMap, agregadosMap);
      refreshAllPrices();
      window.SistemaMenu = window.SistemaMenu || {};
      window.SistemaMenu.refresh = () => refreshAllPrices();
      document.addEventListener("click", onSizeClick);
    } catch (_error) {
      // Si falla la carga, no interrumpimos el sitio del cliente.
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
