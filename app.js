const THREE = window.THREE;

const colors = ["#00a878", "#ff5a00", "#2563eb", "#d81b60", "#7cb518", "#7c3aed", "#eab308", "#dc2626"];
const catalogStorageKey = "container-package-catalog-v1";
const layoutStorageKey = "container-active-layout-v3";
const manualStepDefaultMm = 10;
const defaultPackageCatalog = [
  { id: "crate-a", name: "330ml chubby", length: 0.41, width: 0.271, height: 0.118 },
  { id: "package-500ml-standard", name: "500 ml", length: 0.41, width: 0.271, height: 0.171 },
  { id: "package-250ml-slim", name: "250 ml", length: 0.332, width: 0.219, height: 0.137 },
];

function createDefaultPackages(catalog) {
  return catalog.slice(0, 3).map((item, index) => ({
    ...item,
    catalogId: item.id,
    share: index === 0 ? 100 : 0,
    pieces: index === 0 ? 2380 : 0,
  }));
}

function createEmptyDefaultPackages(catalog) {
  return catalog.slice(0, 3).map((item) => ({
    ...item,
    catalogId: item.id,
    share: 0,
    pieces: 0,
  }));
}

function loadPackageCatalog() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(catalogStorageKey));
    if (Array.isArray(saved) && saved.length) {
      const valid = saved.filter((item) =>
        item && typeof item.id === "string" && item.id && typeof item.name === "string" &&
        Number.isFinite(Number(item.length)) && Number.isFinite(Number(item.width)) && Number.isFinite(Number(item.height))
      );
      if (valid.length) {
        const merged = new Map(defaultPackageCatalog.map((item) => [item.id, { ...item }]));
        valid.forEach((item) => merged.set(item.id, item));
        return [...merged.values()];
      }
    }
  } catch (error) {
    console.warn("Katalog obalů se nepodařilo načíst.", error);
  }
  return defaultPackageCatalog.map((item) => ({ ...item }));
}

function savePackageCatalog(catalog) {
  try {
    window.localStorage.setItem(catalogStorageKey, JSON.stringify(catalog));
  } catch (error) {
    console.warn("Katalog obalů se nepodařilo uložit.", error);
  }
}

function saveActiveLayout() {
  try {
    window.localStorage.setItem(layoutStorageKey, JSON.stringify({
      distributionMode: state.distributionMode,
      container: state.container,
      packages: state.packages,
      currentJobId: state.currentJobId,
      currentJobName: state.currentJobName,
      manualPlan: state.manualPlan,
    }));
  } catch (error) {
    console.warn("Aktivní rozložení se nepodařilo uložit.", error);
  }
}

async function appApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!response.ok) throw new Error(result?.error || "Požadavek se nepodařilo dokončit.");
  return result;
}

const accidentalTestCatalogIds = new Set(["package-1782971038302-a6kypc"]);
const loadedCatalog = loadPackageCatalog();
const needsCatalogRecovery = loadedCatalog.some((item) => accidentalTestCatalogIds.has(item.id));
const initialCatalog = loadedCatalog.filter((item) => !accidentalTestCatalogIds.has(item.id));
if (needsCatalogRecovery) savePackageCatalog(initialCatalog);
let savedLayout = null;
try {
  const parsedLayout = JSON.parse(window.localStorage.getItem(layoutStorageKey));
  if (parsedLayout?.container && Array.isArray(parsedLayout.packages) && parsedLayout.packages.length) savedLayout = parsedLayout;
} catch (error) {
  console.warn("Uložené rozložení se nepodařilo načíst.", error);
}
const safeSavedPackages = savedLayout?.packages
  ?.filter((pkg) => pkg && typeof pkg === "object")
  .map((pkg, index) => ({
    ...pkg,
    catalogId: typeof pkg.catalogId === "string" ? pkg.catalogId : null,
    name: String(pkg.name || `Obal ${index + 1}`),
    length: Math.max(0, Number(pkg.length) || 0),
    width: Math.max(0, Number(pkg.width) || 0),
    height: Math.max(0, Number(pkg.height) || 0),
    share: Math.max(0, Number(pkg.share) || 0),
    pieces: Math.max(0, Number(pkg.pieces) || 0),
  }));

const recoveredSavedPackages = needsCatalogRecovery && safeSavedPackages?.length
  ? [
      ...safeSavedPackages.filter((pkg) => !accidentalTestCatalogIds.has(pkg.catalogId)),
      ...initialCatalog
        .filter((item) => !safeSavedPackages.some((pkg) => pkg.catalogId === item.id))
        .map((item) => ({ ...item, catalogId: item.id, share: 0, pieces: 0 })),
    ]
  : safeSavedPackages;

const state = {
  distributionMode: savedLayout?.distributionMode === "pieces" ? "pieces" : "percent",
  container: {
    length: Math.max(0.1, Math.min(100, Number(savedLayout?.container?.length) || 5.9)),
    width: Math.max(0.1, Math.min(100, Number(savedLayout?.container?.width) || 2.35)),
    height: Math.max(0.1, Math.min(100, Number(savedLayout?.container?.height) || 2.39)),
  },
  catalog: initialCatalog,
  packages: recoveredSavedPackages?.length ? recoveredSavedPackages : createEmptyDefaultPackages(initialCatalog),
  jobs: [],
  jobsLoaded: false,
  currentJobId: typeof savedLayout?.currentJobId === "string" ? savedLayout.currentJobId : "",
  currentJobName: typeof savedLayout?.currentJobName === "string" ? savedLayout.currentJobName : "",
  manualPlan: savedLayout?.manualPlan && typeof savedLayout.manualPlan === "object" ? savedLayout.manualPlan : null,
  selectedPlacementIndex: null,
  manualMessage: "",
};

const els = {
  containerLength: document.querySelector("#containerLength"),
  containerWidth: document.querySelector("#containerWidth"),
  containerHeight: document.querySelector("#containerHeight"),
  containerVolume: document.querySelector("#containerVolume"),
  fillPercent: document.querySelector("#fillPercent"),
  meterBar: document.querySelector("#meterBar"),
  packages: document.querySelector("#packages"),
  packageTemplate: document.querySelector("#packageTemplate"),
  addPackage: document.querySelector("#addPackage"),
  confirmLayout: document.querySelector("#confirmLayout"),
  modeButtons: document.querySelectorAll(".mode-button"),
  normalizeShares: document.querySelector("#normalizeShares"),
  resetDemo: document.querySelector("#resetDemo"),
  warning: document.querySelector("#warning"),
  jobName: document.querySelector("#jobName"),
  jobSelect: document.querySelector("#jobSelect"),
  saveJob: document.querySelector("#saveJob"),
  loadJob: document.querySelector("#loadJob"),
  deleteJob: document.querySelector("#deleteJob"),
  jobStatus: document.querySelector("#jobStatus"),
  visualArea: document.querySelector(".visual-area"),
  viewTabs: document.querySelectorAll(".view-tab"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomIn: document.querySelector("#zoomIn"),
  frontView: document.querySelector("#frontView"),
  resetView: document.querySelector("#resetView"),
  expandView: document.querySelector("#expandView"),
  showAllPacking: document.querySelector("#showAllPacking"),
  showLayerPacking: document.querySelector("#showLayerPacking"),
  showStepPacking: document.querySelector("#showStepPacking"),
  previousLayer: document.querySelector("#previousLayer"),
  nextLayer: document.querySelector("#nextLayer"),
  previousStep: document.querySelector("#previousStep"),
  nextStep: document.querySelector("#nextStep"),
  layerLabel: document.querySelector("#layerLabel"),
  stepLabel: document.querySelector("#stepLabel"),
  previousDepth: document.querySelector("#previousDepth"),
  nextDepth: document.querySelector("#nextDepth"),
  depthLabel: document.querySelector("#depthLabel"),
  placementDetail: document.querySelector("#placementDetail"),
  manualSelectStep: document.querySelector("#manualSelectStep"),
  manualRotate: document.querySelector("#manualRotate"),
  manualAlign: document.querySelector("#manualAlign"),
  manualLeft: document.querySelector("#manualLeft"),
  manualRight: document.querySelector("#manualRight"),
  manualUp: document.querySelector("#manualUp"),
  manualDown: document.querySelector("#manualDown"),
  manualRear: document.querySelector("#manualRear"),
  manualDoor: document.querySelector("#manualDoor"),
  manualReset: document.querySelector("#manualReset"),
  manualStep: document.querySelector("#manualStep"),
  manualAllowOverlap: document.querySelector("#manualAllowOverlap"),
  manualStatus: document.querySelector("#manualStatus"),
  canvas3d: document.querySelector("#container3d"),
  wall2d: document.querySelector("#wall2d"),
  threeFallback: document.querySelector("#threeFallback"),
  containerBlocks: document.querySelector("#containerBlocks"),
  legend: document.querySelector("#legend"),
  shareTotal: document.querySelector("#shareTotal"),
  summaryVolume: document.querySelector("#summaryVolume"),
  summaryFill: document.querySelector("#summaryFill"),
  summaryTypes: document.querySelector("#summaryTypes"),
  stabilityScore: document.querySelector("#stabilityScore"),
  stabilityLabel: document.querySelector("#stabilityLabel"),
  stabilityMeter: document.querySelector("#stabilityMeter"),
  stabilityDetails: document.querySelector("#stabilityDetails"),
  resultRows: document.querySelector("#resultRows"),
};

const threeState = {
  ready: false,
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  containerMesh: null,
  fillGroup: null,
  edgesGroup: null,
  rotationX: 0,
  rotationY: 0.72,
  zoom: 1,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

const packingView = {
  mode: "all",
  layerIndex: 0,
  stepIndex: 0,
  depthIndex: 0,
};

let packingCache = { key: "", plan: null };
let latestPacking = null;

function numberValue(input, fallback = 0) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function fmt(value, digits = 2) {
  return new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(digits, 1),
  }).format(value);
}

function volumeOf(item) {
  return Math.max(0, item.length) * Math.max(0, item.width) * Math.max(0, item.height);
}

function containerVolume() {
  return Math.max(0, state.container.length) * Math.max(0, state.container.width) * Math.max(0, state.container.height);
}

function layoutSignature(packages = state.packages, dimensions = state.container) {
  return JSON.stringify({
    distributionMode: state.distributionMode,
    container: {
      length: Number(dimensions.length).toFixed(4),
      width: Number(dimensions.width).toFixed(4),
      height: Number(dimensions.height).toFixed(4),
    },
    packages: packages.map((pkg) => ({
      name: pkg.name,
      length: Number(pkg.length).toFixed(4),
      width: Number(pkg.width).toFixed(4),
      height: Number(pkg.height).toFixed(4),
      share: Number(pkg.share || 0).toFixed(3),
      pieces: Number(pkg.pieces || 0).toFixed(0),
    })),
  });
}

function clonePlacement(placement, index = null) {
  return {
    packageIndex: Math.max(0, Number(placement.packageIndex) || 0),
    length: Math.max(0, Number(placement.length) || 0),
    height: Math.max(0, Number(placement.height) || 0),
    width: Math.max(0, Number(placement.width) || 0),
    rotated: Boolean(placement.rotated),
    x: Math.max(0, Number(placement.x) || 0),
    y: Math.max(0, Number(placement.y) || 0),
    z: Math.max(0, Number(placement.z) || 0),
    allowOverlap: Boolean(placement.allowOverlap),
    isOverlapping: Boolean(placement.isOverlapping),
    manualIndex: index,
  };
}

function groupPlacementsIntoLayers(placements, packages, dimensions) {
  const validSizes = packages.flatMap((pkg) => [pkg.length, pkg.width]).filter((size) => size > 0);
  const wallDepth = validSizes.length ? Math.max(0.1, Math.min(...validSizes)) : 0.1;
  const rearDistance = (placement) => dimensions.length - placement.x - placement.length;
  const wallGroups = new Map();
  placements.forEach((placement) => {
    const wallIndex = Math.floor((rearDistance(placement) + 1e-7) / wallDepth);
    if (!wallGroups.has(wallIndex)) wallGroups.set(wallIndex, []);
    wallGroups.get(wallIndex).push(placement);
  });
  return {
    wallDepth,
    layers: [...wallGroups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, items]) => items.sort((a, b) =>
        rearDistance(a) - rearDistance(b) || a.y - b.y || a.z - b.z || a.packageIndex - b.packageIndex
      )),
  };
}

function largestAxisGap(intervals, limit) {
  if (!intervals.length) return limit;
  const sorted = intervals
    .map(([start, end]) => [Math.max(0, start), Math.min(limit, end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return limit;
  let largest = sorted[0][0];
  let coveredEnd = sorted[0][1];
  for (let index = 1; index < sorted.length; index += 1) {
    largest = Math.max(largest, sorted[index][0] - coveredEnd);
    coveredEnd = Math.max(coveredEnd, sorted[index][1]);
  }
  return Math.max(largest, limit - coveredEnd);
}

function summarizePacking(basePlan, placements, packages, dimensions, manualActive = false) {
  const indexedPlacements = placements.map((placement, index) => clonePlacement(placement, index));
  const totalVolume = dimensions.length * dimensions.width * dimensions.height;
  const packedVolume = indexedPlacements.reduce((sum, placement) => sum + volumeOf(packages[placement.packageIndex] || {}), 0);
  const actualCounts = packages.map((pkg, packageIndex) =>
    indexedPlacements.reduce((count, placement) => count + (placement.packageIndex === packageIndex ? 1 : 0), 0)
  );
  const actualShares = packages.map((pkg, index) =>
    packedVolume > 0 ? ((actualCounts[index] * volumeOf(pkg)) / packedVolume) * 100 : 0
  );
  const maxShareDeviation = actualShares.reduce((max, share, index) =>
    Math.max(max, Math.abs(share - (packages[index]?.normalizedShare || 0))), 0
  );
  let overlapCount = 0;
  const overlappingIndexes = new Set();
  for (let left = 0; left < indexedPlacements.length; left += 1) {
    for (let right = left + 1; right < indexedPlacements.length; right += 1) {
      if (placementsOverlap(indexedPlacements[left], indexedPlacements[right], 1e-7)) {
        overlapCount += 1;
        overlappingIndexes.add(left);
        overlappingIndexes.add(right);
      }
    }
  }
  indexedPlacements.forEach((placement, index) => {
    placement.isOverlapping = overlappingIndexes.has(index);
  });
  const { wallDepth, layers } = groupPlacementsIntoLayers(indexedPlacements, packages, dimensions);
  const minZ = indexedPlacements.length ? Math.min(...indexedPlacements.map((placement) => placement.z)) : 0;
  const maxZ = indexedPlacements.length ? Math.max(...indexedPlacements.map((placement) => placement.z + placement.width)) : 0;
  const maxTop = indexedPlacements.length ? Math.max(...indexedPlacements.map((placement) => placement.y + placement.height)) : 0;
  const minX = indexedPlacements.length ? Math.min(...indexedPlacements.map((placement) => placement.x)) : dimensions.length;
  const maxFrontGap = indexedPlacements.length ? Math.max(...indexedPlacements.map((placement) => placement.x)) : dimensions.length;
  const zGap = largestAxisGap(indexedPlacements.map((placement) => [placement.z, placement.z + placement.width]), dimensions.width);
  const supportValues = indexedPlacements.map((placement) =>
    supportCoverage({ x: placement.x, y: placement.y, z: placement.z }, placement, indexedPlacements.filter((item) => item !== placement), 1e-7)
  );
  const unsupportedCount = supportValues.filter((coverage) => coverage < 0.98).length;
  const adjacencyChanges = indexedPlacements
    .slice()
    .sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y)
    .reduce((count, placement, index, items) => {
      if (index === 0) return 0;
      const previous = items[index - 1];
      return count + (previous.packageIndex !== placement.packageIndex || previous.rotated !== placement.rotated ? 1 : 0);
    }, 0);

  return {
    ...basePlan,
    placements: indexedPlacements,
    layers,
    wallDepth,
    containerLength: dimensions.length,
    targetCount: basePlan.targetCount || indexedPlacements.length,
    overlapCount,
    actualShares,
    maxShareDeviation,
    limited: manualActive ? false : Boolean(basePlan.limited),
    packedPercent: totalVolume > 0 ? (packedVolume / totalVolume) * 100 : 0,
    actualCounts,
    totalPackedPieces: indexedPlacements.length,
    sideGapCm: Math.max(minZ, Math.max(0, dimensions.width - maxZ)) * 100,
    betweenColumnGapCm: zGap * 100,
    lockPattern: adjacencyChanges > 0,
    columnCount: basePlan.columnCount || 0,
    topGapCm: Math.max(0, dimensions.height - maxTop) * 100,
    minEndGapCm: minX * 100,
    maxEndGapCm: maxFrontGap * 100,
    unsupportedCount,
    supportPercent: supportValues.length
      ? (supportValues.reduce((sum, value) => sum + Math.min(1, value), 0) / supportValues.length) * 100
      : 100,
    manualActive,
  };
}

function planWithManualEdits(basePlan, packages, dimensions) {
  const signature = layoutSignature();
  if (!state.manualPlan || state.manualPlan.signature !== signature || !Array.isArray(state.manualPlan.placements)) {
    const summarized = summarizePacking(basePlan, basePlan.placements, packages, dimensions, false);
    return basePlan.limited
      ? {
          ...summarized,
          limited: true,
          targetCount: basePlan.targetCount,
          actualShares: basePlan.actualShares,
          actualCounts: basePlan.actualCounts,
          packedPercent: basePlan.packedPercent,
          totalPackedPieces: basePlan.totalPackedPieces,
        }
      : summarized;
  }
  if (state.manualPlan.placements.length !== basePlan.placements.length) {
    state.manualPlan = null;
    state.selectedPlacementIndex = null;
    saveActiveLayout();
    return summarizePacking(basePlan, basePlan.placements, packages, dimensions, false);
  }
  return summarizePacking(basePlan, state.manualPlan.placements, packages, dimensions, true);
}

function calculateStability(packing) {
  const sideGap = Number.isFinite(packing.sideGapCm) ? packing.sideGapCm : 999;
  const betweenGap = Number.isFinite(packing.betweenColumnGapCm) ? packing.betweenColumnGapCm : 999;
  const topGap = Number.isFinite(packing.topGapCm) ? packing.topGapCm : 999;
  const supportPercent = Number.isFinite(packing.supportPercent) ? packing.supportPercent : 100;
  const fillPenalty = Math.max(0, 98 - packing.packedPercent) * 1.2;
  const sidePenalty = Math.max(0, sideGap - 3) * 1.8;
  const betweenPenalty = Math.max(0, betweenGap - 2) * 1.5;
  const topPenalty = Math.max(0, topGap - 6) * 1.4;
  const overlapPenalty = packing.overlapCount * 12;
  const supportPenalty = Math.max(0, 99 - supportPercent) * 2 + (packing.unsupportedCount || 0) * 4;
  const score = Math.max(0, Math.min(100, Math.round(
    100 - fillPenalty - sidePenalty - betweenPenalty - topPenalty - overlapPenalty - supportPenalty
  )));
  const label = score >= 88 ? "Velmi dobrá" : score >= 72 ? "Dobrá" : score >= 55 ? "Ke kontrole" : "Riziko pohybu";
  const details = [
    `bok ${fmt(sideGap, 1)} cm`,
    `mezi sloupci ${fmt(betweenGap, 1)} cm`,
    `strop ${fmt(topGap, 1)} cm`,
    `podpora ${fmt(supportPercent, 0)} %`,
  ];
  if (packing.overlapCount) details.push(`překryvy ${packing.overlapCount}`);
  if (packing.manualActive) details.push("ručně upraveno");
  return { score, label, details };
}

function confirmLayout() {
  const previousSignature = layoutSignature();
  syncStateFromDom();
  state.container = {
    length: Math.max(0.1, Math.min(100, numberValue(els.containerLength, state.container.length))),
    width: Math.max(0.1, Math.min(100, numberValue(els.containerWidth, state.container.width))),
    height: Math.max(0.1, Math.min(100, numberValue(els.containerHeight, state.container.height))),
  };
  state.packages.forEach((pkg) => {
    let catalogItem = state.catalog.find((item) => item.id === pkg.catalogId);
    if (!catalogItem) {
      pkg.catalogId = `package-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      catalogItem = { id: pkg.catalogId };
      state.catalog.push(catalogItem);
    }
    Object.assign(catalogItem, {
      name: pkg.name,
      length: pkg.length,
      width: pkg.width,
      height: pkg.height,
    });
  });
  if (previousSignature !== layoutSignature()) {
    state.manualPlan = null;
    state.selectedPlacementIndex = null;
    state.manualMessage = "Automaticky přepočítáno po změně zadání.";
  }
  savePackageCatalog(state.catalog);
  saveActiveLayout();
  els.confirmLayout.classList.remove("is-pending");
  renderPackageCards();
  render();
}

function markLayoutPending() {
  els.confirmLayout.classList.add("is-pending");
}

function readPackageCard(card) {
  return {
    catalogId: card.querySelector(".package-type-select").value || null,
    name: card.querySelector(".package-name").value.trim() || "Obal",
    length: numberValue(card.querySelector(".pkg-length")) / 1000,
    width: numberValue(card.querySelector(".pkg-width")) / 1000,
    height: numberValue(card.querySelector(".pkg-height")) / 1000,
    share: Math.max(0, numberValue(card.querySelector(".pkg-share"))),
    pieces: Math.max(0, numberValue(card.querySelector(".pkg-pieces"))),
  };
}

function syncStateFromDom() {
  state.packages = [...els.packages.querySelectorAll(".package-card")].map(readPackageCard);
}

function renderPackageCards() {
  els.packages.innerHTML = "";

  state.packages.forEach((pkg, index) => {
    const node = els.packageTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.index = index;
    const typeSelect = node.querySelector(".package-type-select");
    typeSelect.innerHTML = '<option value="">Nový typ…</option>';
    state.catalog.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      typeSelect.appendChild(option);
    });
    typeSelect.value = pkg.catalogId || "";
    node.querySelector(".package-name").value = pkg.name;
    node.querySelector(".pkg-length").value = Math.round(pkg.length * 1000);
    node.querySelector(".pkg-width").value = Math.round(pkg.width * 1000);
    node.querySelector(".pkg-height").value = Math.round(pkg.height * 1000);
    node.querySelector(".pkg-share").value = pkg.share;
    node.querySelector(".pkg-pieces").value = pkg.pieces;
    node.querySelector(".remove-package").disabled = false;
    node.style.borderTop = `4px solid ${colors[index % colors.length]}`;
    els.packages.appendChild(node);
  });
}

function renderDraftPackageCards(packages) {
  const confirmedPackages = state.packages;
  state.packages = packages;
  renderPackageCards();
  state.packages = confirmedPackages;
}

function normalizedPackages() {
  const weights = state.packages.map((pkg) =>
    state.distributionMode === "pieces"
      ? Math.max(0, pkg.pieces) * volumeOf(pkg)
      : Math.max(0, pkg.share)
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return state.packages.map((pkg, index) => ({
    ...pkg,
    normalizedShare: total > 0 ? (weights[index] / total) * 100 : 0,
  }));
}

function render() {
  const totalShare = state.packages.reduce((sum, pkg) => sum + Math.max(0, pkg.share), 0);
  const totalPieces = state.packages.reduce((sum, pkg) => sum + Math.max(0, pkg.pieces), 0);
  const volume = containerVolume();
  const dimensions = containerDimensions();
  const packages = normalizedPackages();
  const hasInvalidPackage = packages.some((pkg) => volumeOf(pkg) <= 0);
  const packing = planWithManualEdits(buildPackingPlan(packages, dimensions), packages, dimensions);
  latestPacking = packing;
  const actualFill = packing.packedPercent;
  const stability = calculateStability(packing);
  const shareLabel = state.distributionMode === "pieces" ? `${fmt(totalPieces, 0)} ks` : `${fmt(totalShare, 1)} %`;

  els.containerVolume.textContent = `${fmt(volume, 2)} m3`;
  els.summaryVolume.textContent = `${fmt(volume, 2)} m3`;
  els.summaryFill.textContent = `${fmt(actualFill, 1)} %`;
  els.summaryTypes.textContent = String(packages.length);
  els.stabilityScore.textContent = String(stability.score);
  els.stabilityLabel.textContent = stability.label;
  els.stabilityMeter.style.width = `${stability.score}%`;
  els.stabilityDetails.textContent = stability.details.join(" · ");
  els.fillPercent.textContent = `${fmt(actualFill, 1)} %`;
  els.shareTotal.textContent = shareLabel;
  els.meterBar.style.width = `${Math.max(0, Math.min(100, actualFill))}%`;

  const warnings = [];
  const hasEnteredLoad = state.distributionMode === "pieces" ? totalPieces > 0 : totalShare > 0;
  if (!packages.length || !hasEnteredLoad) {
    warnings.push(packages.length
      ? "Kontejner je prázdný. Nastavte podíl nebo počet kusů a potvrďte přepočet."
      : "Kontejner je prázdný. Přidejte první obal tlačítkem plus.");
  } else if (state.distributionMode === "percent" && Math.abs(totalShare - 100) > 0.05) {
    warnings.push(`Součet podílů je ${shareLabel}; výpočet ho přepočítává poměrem na 100 %.`);
  }
  if (hasInvalidPackage) {
    warnings.push("Některý obal má nulový rozměr, proto u něj nelze spočítat kusy.");
  }
  els.warning.textContent = warnings.join(" ");

  renderVisual(packages, volume);
  renderThreeScene(packages, dimensions, packing);
  renderResults(packages, volume, packing);
}

function containerDimensions() {
  return {
    length: Math.max(0.1, Math.min(100, state.container.length)),
    width: Math.max(0.1, Math.min(100, state.container.width)),
    height: Math.max(0.1, Math.min(100, state.container.height)),
  };
}

function renderVisual(packages, volume) {
  els.containerBlocks.innerHTML = "";
  els.legend.innerHTML = "";

  packages.forEach((pkg, index) => {
    const color = colors[index % colors.length];
    const block = document.createElement("div");
    block.className = "load-block";
    block.style.width = `${pkg.normalizedShare}%`;
    block.style.background = color;
    block.textContent = pkg.normalizedShare >= 9 ? `${fmt(pkg.normalizedShare, 0)} %` : "";
    els.containerBlocks.appendChild(block);

    const legend = document.createElement("div");
    legend.className = "legend-item";
    legend.innerHTML = `<span class="swatch" style="background:${color}"></span><span>${pkg.name} · ${fmt(pkg.normalizedShare, 1)} %</span>`;
    els.legend.appendChild(legend);
  });
}

function renderResults(packages, volume, packing) {
  els.resultRows.innerHTML = "";
  const actualCounts = packing.actualCounts || packages.map((pkg, packageIndex) =>
    packing.placements.reduce((count, placement) => count + (placement.packageIndex === packageIndex ? 1 : 0), 0)
  );

  packages.forEach((pkg, index) => {
    const pkgVolume = volumeOf(pkg);
    const targetVolume = (volume * pkg.normalizedShare) / 100;
    const exactPieces = pkgVolume > 0 ? targetVolume / pkgVolume : 0;
    const wholePieces = Math.floor(exactPieces);
    const actualPieces = actualCounts[index];
    const actualVolume = actualPieces * pkgVolume;
    const row = document.createElement("tr");
    const color = colors[index % colors.length];

    row.innerHTML = `
      <td>
        <span class="result-name"><span class="swatch" style="background:${color}"></span>${pkg.name}</span>
        <span class="small-note">${fmt(pkg.length * 1000, 0)} × ${fmt(pkg.width * 1000, 0)} × ${fmt(pkg.height * 1000, 0)} mm</span>
      </td>
      <td>${fmt(pkg.normalizedShare, 1)} %</td>
      <td>
        ${fmt(actualVolume, 3)} m3
        <span class="small-note">skutečně naloženo · 1 ks: ${fmt(pkgVolume, 4)} m3</span>
      </td>
      <td>
        ${fmt(actualPieces, 0)} ks
        <span class="small-note">skutečně rozmístěno · teoreticky pouze podle objemu: ${fmt(wholePieces, 0)} ks</span>
      </td>
    `;
    els.resultRows.appendChild(row);
  });
}

function currentJobData() {
  return {
    version: 1,
    distributionMode: state.distributionMode,
    container: state.container,
    packages: state.packages,
    manualPlan: state.manualPlan,
  };
}

function safeJobName() {
  return (els.jobName.value.trim() || state.currentJobName || `Zakázka ${new Date().toLocaleDateString("cs-CZ")}`).slice(0, 80);
}

function renderJobs() {
  if (!els.jobSelect) return;
  els.jobName.value = state.currentJobName || "";
  els.jobSelect.innerHTML = '<option value="">Vyber uloženou zakázku</option>';
  state.jobs.forEach((job) => {
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = job.name;
    els.jobSelect.appendChild(option);
  });
  els.jobSelect.value = state.currentJobId || "";
  els.loadJob.disabled = !els.jobSelect.value;
  els.deleteJob.disabled = !els.jobSelect.value;
  els.jobStatus.textContent = state.jobsLoaded
    ? (state.currentJobName ? `Otevřená: ${state.currentJobName}` : `${state.jobs.length} uložených zakázek`)
    : "Načítám zakázky...";
}

async function loadJobs() {
  if (!els.jobSelect) return;
  try {
    const result = await appApi("/api/jobs");
    state.jobs = Array.isArray(result.jobs) ? result.jobs : [];
    state.jobsLoaded = true;
    renderJobs();
  } catch (error) {
    state.jobsLoaded = true;
    els.jobStatus.textContent = error.message;
  }
}

function sanitizeLoadedPackages(packages) {
  return Array.isArray(packages)
    ? packages
      .filter((pkg) => pkg && typeof pkg === "object")
      .map((pkg, index) => ({
        catalogId: typeof pkg.catalogId === "string" ? pkg.catalogId : null,
        name: String(pkg.name || `Obal ${index + 1}`),
        length: Math.max(0, Number(pkg.length) || 0),
        width: Math.max(0, Number(pkg.width) || 0),
        height: Math.max(0, Number(pkg.height) || 0),
        share: Math.max(0, Number(pkg.share) || 0),
        pieces: Math.max(0, Number(pkg.pieces) || 0),
      }))
    : [];
}

function mergeLoadedPackagesIntoCatalog(packages) {
  packages.forEach((pkg) => {
    if (!pkg.catalogId) {
      pkg.catalogId = `package-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const existing = state.catalog.find((item) => item.id === pkg.catalogId);
    const data = {
      id: pkg.catalogId,
      name: pkg.name,
      length: pkg.length,
      width: pkg.width,
      height: pkg.height,
    };
    if (existing) Object.assign(existing, data);
    else state.catalog.push(data);
  });
  savePackageCatalog(state.catalog);
}

function applyJob(job) {
  const data = job?.data || {};
  const packages = sanitizeLoadedPackages(data.packages);
  if (!packages.length) throw new Error("Zakázka nemá žádné obaly.");
  mergeLoadedPackagesIntoCatalog(packages);
  state.currentJobId = job.id;
  state.currentJobName = job.name;
  state.distributionMode = data.distributionMode === "pieces" ? "pieces" : "percent";
  state.container = {
    length: Math.max(0.1, Math.min(100, Number(data.container?.length) || 5.9)),
    width: Math.max(0.1, Math.min(100, Number(data.container?.width) || 2.35)),
    height: Math.max(0.1, Math.min(100, Number(data.container?.height) || 2.39)),
  };
  state.packages = packages;
  state.manualPlan = data.manualPlan && typeof data.manualPlan === "object" ? data.manualPlan : null;
  state.selectedPlacementIndex = null;
  state.manualMessage = state.manualPlan ? "Načtena ruční úprava zakázky." : "";
  packingView.mode = "all";
  packingView.layerIndex = 0;
  packingView.stepIndex = 0;
  packingView.depthIndex = 0;
  document.body.dataset.distributionMode = state.distributionMode;
  els.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.distributionMode));
  els.containerLength.value = state.container.length;
  els.containerWidth.value = state.container.width;
  els.containerHeight.value = state.container.height;
  els.confirmLayout.classList.remove("is-pending");
  renderPackageCards();
  saveActiveLayout();
  render();
  renderJobs();
}

async function saveJob() {
  confirmLayout();
  const name = safeJobName();
  els.jobStatus.textContent = "Ukládám zakázku...";
  try {
    const result = await appApi("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        id: state.currentJobId || undefined,
        name,
        data: currentJobData(),
      }),
    });
    const job = result.job;
    state.currentJobId = job.id;
    state.currentJobName = job.name;
    const existingIndex = state.jobs.findIndex((item) => item.id === job.id);
    if (existingIndex >= 0) state.jobs[existingIndex] = job;
    else state.jobs.unshift(job);
    saveActiveLayout();
    renderJobs();
    els.jobStatus.textContent = `Uloženo: ${job.name}`;
  } catch (error) {
    els.jobStatus.textContent = error.message;
  }
}

async function loadSelectedJob() {
  const job = state.jobs.find((item) => item.id === els.jobSelect.value);
  if (!job) return;
  try {
    applyJob(job);
    els.jobStatus.textContent = `Načteno: ${job.name}`;
  } catch (error) {
    els.jobStatus.textContent = error.message;
  }
}

async function deleteSelectedJob() {
  const jobId = els.jobSelect.value;
  if (!jobId) return;
  els.jobStatus.textContent = "Mažu zakázku...";
  try {
    await appApi(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
    state.jobs = state.jobs.filter((job) => job.id !== jobId);
    if (state.currentJobId === jobId) {
      state.currentJobId = "";
      state.currentJobName = "";
    }
    saveActiveLayout();
    renderJobs();
    els.jobStatus.textContent = "Zakázka smazána.";
  } catch (error) {
    els.jobStatus.textContent = error.message;
  }
}

function initThreeScene() {
  if (!els.canvas3d || threeState.ready) return threeState.ready;
  if (!THREE) {
    els.threeFallback.hidden = false;
    return false;
  }

  threeState.scene = new THREE.Scene();
  threeState.scene.background = new THREE.Color(0xedf1ec);

  threeState.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  threeState.camera.position.set(7.5, 1.8, 7.2);
  threeState.camera.lookAt(0, 0, 0);

  try {
    threeState.renderer = new THREE.WebGLRenderer({
      canvas: els.canvas3d,
      antialias: true,
      alpha: true,
    });
  } catch (error) {
    console.error("3D zobrazení se nepodařilo spustit.", error);
    els.threeFallback.hidden = false;
    els.visualArea.dataset.threeReady = "false";
    return false;
  }
  threeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const ambient = new THREE.HemisphereLight(0xffffff, 0x96a39d, 1.7);
  threeState.scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(3, 5, 4);
  threeState.scene.add(key);

  threeState.root = new THREE.Group();
  threeState.root.rotation.order = "YXZ";
  threeState.scene.add(threeState.root);

  threeState.fillGroup = new THREE.Group();
  threeState.edgesGroup = new THREE.Group();
  threeState.root.add(threeState.fillGroup);
  threeState.root.add(threeState.edgesGroup);

  els.canvas3d.addEventListener("pointerdown", (event) => {
    threeState.dragging = true;
    threeState.lastX = event.clientX;
    threeState.lastY = event.clientY;
    els.canvas3d.setPointerCapture(event.pointerId);
  });

  els.canvas3d.addEventListener("pointermove", (event) => {
    if (!threeState.dragging) return;
    const dx = event.clientX - threeState.lastX;
    threeState.rotationY += dx * 0.006;
    threeState.lastX = event.clientX;
    threeState.lastY = event.clientY;
    drawThreeScene();
  });

  els.canvas3d.addEventListener("pointerup", (event) => {
    threeState.dragging = false;
    els.canvas3d.releasePointerCapture(event.pointerId);
  });

  els.canvas3d.addEventListener("wheel", (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0012);
    threeState.zoom = Math.max(0.65, Math.min(2.5, threeState.zoom * factor));
    drawThreeScene();
  }, { passive: false });

  window.addEventListener("resize", drawThreeScene);
  threeState.ready = true;
  window.__container3dReady = true;
  els.visualArea.dataset.threeReady = "true";
  return true;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose();
    child.material?.map?.dispose();
    child.material?.dispose();
  }
}

function createPackageTexture(color, hatched = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "#101412";
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = color;
  context.fillRect(1, 1, 62, 62);
  if (hatched) {
    context.strokeStyle = "#fff200";
    context.lineWidth = 6;
    for (let offset = -64; offset < 128; offset += 14) {
      context.beginPath();
      context.moveTo(offset, 64);
      context.lineTo(offset + 64, 0);
      context.stroke();
    }
    context.strokeStyle = "#101412";
    context.lineWidth = 2;
    for (let offset = -64; offset < 128; offset += 14) {
      context.beginPath();
      context.moveTo(offset + 6, 64);
      context.lineTo(offset + 70, 0);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function bestPackageOrientation(pkg, space) {
  const orientations = [
    { x: pkg.length, y: pkg.height, z: pkg.width },
    { x: pkg.width, y: pkg.height, z: pkg.length },
  ];

  return orientations.reduce((best, orientation) => {
    const nx = Math.floor(space.length / orientation.x + 1e-9);
    const ny = Math.floor(space.height / orientation.y + 1e-9);
    const nz = Math.floor(space.width / orientation.z + 1e-9);
    const count = Math.max(0, nx * ny * nz);
    const candidate = { ...orientation, nx, ny, nz, count };
    return !best || candidate.count > best.count ? candidate : best;
  }, null);
}

function packageOrientations(pkg) {
  return [
    { length: pkg.length, height: pkg.height, width: pkg.width, rotated: false },
    { length: pkg.width, height: pkg.height, width: pkg.length, rotated: true },
  ];
}

function placementsOverlap(a, b, epsilon = 1e-7) {
  return (
    a.x < b.x + b.length - epsilon &&
    a.x + a.length > b.x + epsilon &&
    a.y < b.y + b.height - epsilon &&
    a.y + a.height > b.y + epsilon &&
    a.z < b.z + b.width - epsilon &&
    a.z + a.width > b.z + epsilon
  );
}

function spacesIntersect(space, box, epsilon = 1e-7) {
  return !(
    box.x + box.length <= space.x + epsilon ||
    box.x >= space.x + space.length - epsilon ||
    box.y + box.height <= space.y + epsilon ||
    box.y >= space.y + space.height - epsilon ||
    box.z + box.width <= space.z + epsilon ||
    box.z >= space.z + space.width - epsilon
  );
}

function prunePackingSpaces(spaces, epsilon = 1e-7) {
  const valid = spaces.filter((space) => space.length > epsilon && space.height > epsilon && space.width > epsilon);
  return valid.filter((space, index) =>
    !valid.some((other, otherIndex) =>
      index !== otherIndex &&
      space.x >= other.x - epsilon &&
      space.y >= other.y - epsilon &&
      space.z >= other.z - epsilon &&
      space.x + space.length <= other.x + other.length + epsilon &&
      space.y + space.height <= other.y + other.height + epsilon &&
      space.z + space.width <= other.z + other.width + epsilon
    )
  );
}

function supportCoverage(position, orientation, placements, epsilon = 1e-7) {
  if (position.y <= epsilon) return 1;

  const xMin = position.x;
  const xMax = position.x + orientation.length;
  const zMin = position.z;
  const zMax = position.z + orientation.width;
  const supports = placements.filter((placement) =>
    Math.abs(placement.y + placement.height - position.y) < epsilon &&
    placement.x < xMax - epsilon &&
    placement.x + placement.length > xMin + epsilon &&
    placement.z < zMax - epsilon &&
    placement.z + placement.width > zMin + epsilon
  );
  if (!supports.length) return 0;

  const xBreaks = [xMin, xMax];
  const zBreaks = [zMin, zMax];
  supports.forEach((support) => {
    xBreaks.push(Math.max(xMin, support.x), Math.min(xMax, support.x + support.length));
    zBreaks.push(Math.max(zMin, support.z), Math.min(zMax, support.z + support.width));
  });
  const xs = [...new Set(xBreaks)].sort((a, b) => a - b);
  const zs = [...new Set(zBreaks)].sort((a, b) => a - b);

  let coveredArea = 0;
  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let zi = 0; zi < zs.length - 1; zi += 1) {
      const x = (xs[xi] + xs[xi + 1]) / 2;
      const z = (zs[zi] + zs[zi + 1]) / 2;
      const covered = supports.some((support) =>
        x >= support.x - epsilon && x <= support.x + support.length + epsilon &&
        z >= support.z - epsilon && z <= support.z + support.width + epsilon
      );
      if (covered) coveredArea += (xs[xi + 1] - xs[xi]) * (zs[zi + 1] - zs[zi]);
    }
  }
  return coveredArea / (orientation.length * orientation.width);
}

function buildSinglePackagePlan(pkg, dimensions) {
  const widthMm = Math.round(dimensions.width * 1000);
  const orientations = packageOrientations(pkg)
    .map((orientation) => ({ ...orientation, widthMm: Math.round(orientation.width * 1000) }))
    .filter((orientation, index, items) =>
      orientation.widthMm > 0 && orientation.length > 0 && orientation.height > 0 &&
      items.findIndex((item) => item.widthMm === orientation.widthMm && item.length === orientation.length) === index
    );
  const bestCapacity = new Int32Array(widthMm + 1);
  const previousWidth = new Int32Array(widthMm + 1).fill(-1);
  const previousOrientation = new Int16Array(widthMm + 1).fill(-1);
  previousWidth[0] = 0;

  for (let used = 0; used <= widthMm; used += 1) {
    if (previousWidth[used] < 0) continue;
    orientations.forEach((orientation, orientationIndex) => {
      const next = used + orientation.widthMm;
      if (next > widthMm) return;
      const columnCapacity = Math.floor(dimensions.length / orientation.length + 1e-9) * Math.floor(dimensions.height / orientation.height + 1e-9);
      const capacity = bestCapacity[used] + columnCapacity;
      if (previousWidth[next] < 0 || capacity > bestCapacity[next]) {
        bestCapacity[next] = capacity;
        previousWidth[next] = used;
        previousOrientation[next] = orientationIndex;
      }
    });
  }

  let usedWidthMm = 0;
  for (let width = 1; width <= widthMm; width += 1) {
    if (previousWidth[width] >= 0 && width > usedWidthMm) usedWidthMm = width;
  }

  const selected = [];
  for (let width = usedWidthMm; width > 0;) {
    const orientationIndex = previousOrientation[width];
    if (orientationIndex < 0) break;
    selected.push(orientations[orientationIndex]);
    width = previousWidth[width];
  }

  const normalColumns = selected.filter((orientation) => !orientation.rotated);
  const rotatedColumns = selected.filter((orientation) => orientation.rotated);
  const usesLockPattern = normalColumns.length > 0 && rotatedColumns.length > 0;
  const columns = [];
  let preferRotated = rotatedColumns.length > normalColumns.length;
  while (normalColumns.length || rotatedColumns.length) {
    const preferred = preferRotated ? rotatedColumns : normalColumns;
    const fallback = preferRotated ? normalColumns : rotatedColumns;
    columns.push((preferred.length ? preferred : fallback).pop());
    preferRotated = !preferRotated;
  }

  const totalSideGap = Math.max(0, dimensions.width - usedWidthMm / 1000);
  const topGap = dimensions.height - Math.floor(dimensions.height / pkg.height + 1e-9) * pkg.height;
  const endGaps = columns.map((orientation) =>
    dimensions.length - Math.floor(dimensions.length / orientation.length + 1e-9) * orientation.length
  );
  let z = totalSideGap / 2;
  const placements = [];
  const maxVisiblePackages = 5000;
  const totalPackedPieces = columns.reduce((sum, orientation) =>
    sum + Math.floor(dimensions.length / orientation.length + 1e-9) * Math.floor(dimensions.height / orientation.height + 1e-9), 0
  );
  columns.forEach((orientation) => {
    const countX = Math.floor(dimensions.length / orientation.length + 1e-9);
    const countY = Math.floor(dimensions.height / orientation.height + 1e-9);
    for (let ix = 0; ix < countX && placements.length < maxVisiblePackages; ix += 1) {
      for (let iy = 0; iy < countY && placements.length < maxVisiblePackages; iy += 1) {
        placements.push({
          packageIndex: 0,
          ...orientation,
          x: dimensions.length - (ix + 1) * orientation.length,
          y: iy * orientation.height,
          z,
        });
      }
    }
    z += orientation.width;
  });

  const rearDistance = (placement) => dimensions.length - placement.x - placement.length;
  const wallDepth = Math.max(0.1, Math.min(pkg.length, pkg.width));
  const wallGroups = new Map();
  placements.forEach((placement) => {
    const wallIndex = Math.floor((rearDistance(placement) + 1e-7) / wallDepth);
    if (!wallGroups.has(wallIndex)) wallGroups.set(wallIndex, []);
    wallGroups.get(wallIndex).push(placement);
  });
  const layers = [...wallGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => items.sort((a, b) => rearDistance(a) - rearDistance(b) || a.y - b.y || a.z - b.z));
  const totalVolume = dimensions.length * dimensions.width * dimensions.height;
  const packedVolume = totalPackedPieces * volumeOf(pkg);

  return {
    placements,
    layers,
    wallDepth,
    containerLength: dimensions.length,
    targetCount: volumeOf(pkg) > 0 ? Math.floor(totalVolume / volumeOf(pkg)) : 0,
    overlapCount: 0,
    actualShares: [100],
    maxShareDeviation: 0,
    limited: totalPackedPieces > placements.length,
    packedPercent: totalVolume > 0 ? (packedVolume / totalVolume) * 100 : 0,
    actualCounts: [totalPackedPieces],
    totalPackedPieces,
    sideGapCm: totalSideGap * 50,
    betweenColumnGapCm: 0,
    lockPattern: usesLockPattern,
    columnCount: columns.length,
    topGapCm: topGap * 100,
    minEndGapCm: (endGaps.length ? Math.min(...endGaps) : dimensions.length) * 100,
    maxEndGapCm: (endGaps.length ? Math.max(...endGaps) : dimensions.length) * 100,
  };
}

function buildMixedColumnPlan(packages, dimensions) {
  const widthMm = Math.round(dimensions.width * 1000);
  const totalVolume = dimensions.length * dimensions.width * dimensions.height;
  const candidates = packages.flatMap((pkg, packageIndex) =>
    packageOrientations(pkg).map((orientation) => {
      const countX = Math.floor(dimensions.length / orientation.length + 1e-9);
      const countY = Math.floor(dimensions.height / orientation.height + 1e-9);
      const capacity = countX * countY;
      return {
        packageIndex,
        ...orientation,
        widthMm: Math.round(orientation.width * 1000),
        countX,
        countY,
        capacity,
        packedVolume: capacity * volumeOf(pkg),
      };
    })
  ).filter((candidate) =>
    candidate.widthMm > 0 && candidate.widthMm <= widthMm && candidate.capacity > 0
  );
  if (!candidates.length) return null;

  const fillable = new Uint8Array(widthMm + 1);
  fillable[0] = 1;
  for (let width = 1; width <= widthMm; width += 1) {
    fillable[width] = candidates.some((candidate) => width >= candidate.widthMm && fillable[width - candidate.widthMm]);
  }
  const bestWaste = new Int32Array(widthMm + 1);
  let lastFillable = 0;
  for (let width = 0; width <= widthMm; width += 1) {
    if (fillable[width]) lastFillable = width;
    bestWaste[width] = width - lastFillable;
  }

  const columns = [];
  const placedVolumes = packages.map(() => 0);
  let currentVolume = 0;
  let remainingMm = widthMm;
  while (columns.length < 500) {
    let best = null;
    candidates.forEach((candidate) => {
      if (candidate.widthMm > remainingMm) return;
      const nextVolumes = placedVolumes.map((value, index) => value + (index === candidate.packageIndex ? candidate.packedVolume : 0));
      const nextTotal = currentVolume + candidate.packedVolume;
      const ratioError = nextVolumes.reduce((sum, value, index) =>
        sum + Math.abs((value / nextTotal) * 100 - packages[index].normalizedShare), 0
      );
      const remainingAfter = remainingMm - candidate.widthMm;
      const finalWaste = bestWaste[remainingAfter];
      const efficiency = candidate.packedVolume / Math.max(1e-9, dimensions.length * dimensions.height * candidate.width);
      const previous = columns[columns.length - 1];
      const lockBonus = previous && (previous.rotated !== candidate.rotated || previous.packageIndex !== candidate.packageIndex) ? 30 : 0;
      const score = -finalWaste * 10000 - ratioError * 35 + efficiency * 180 + lockBonus;
      if (!best || score > best.score) best = { ...candidate, score };
    });
    if (!best) break;
    columns.push(best);
    placedVolumes[best.packageIndex] += best.packedVolume;
    currentVolume += best.packedVolume;
    remainingMm -= best.widthMm;
  }
  if (!columns.length) return null;

  columns.forEach((column) => {
    const baseTop = column.countY * column.height;
    const supportedLength = column.countX * column.length;
    const availableHeight = dimensions.height - baseTop;
    if (supportedLength <= 0 || availableHeight <= 1e-9) return;

    let bestFiller = null;
    packages.forEach((pkg, packageIndex) => {
      packageOrientations(pkg).forEach((orientation) => {
        if (orientation.width > column.width + 1e-9 || orientation.height > availableHeight + 1e-9) return;
        const countX = Math.floor(supportedLength / orientation.length + 1e-9);
        const countY = Math.floor(availableHeight / orientation.height + 1e-9);
        const capacity = countX * countY;
        if (capacity <= 0) return;

        const packedVolume = capacity * volumeOf(pkg);
        const nextTotal = currentVolume + packedVolume;
        const ratioError = placedVolumes.reduce((sum, value, index) => {
          const nextValue = value + (index === packageIndex ? packedVolume : 0);
          return sum + Math.abs((nextValue / nextTotal) * 100 - packages[index].normalizedShare);
        }, 0);
        const slabVolume = supportedLength * column.width * availableHeight;
        const fillEfficiency = packedVolume / Math.max(1e-9, slabVolume);
        const remainingTop = availableHeight - countY * orientation.height;
        const score = fillEfficiency * 1200 - remainingTop * 500 - ratioError * 8;
        if (!bestFiller || score > bestFiller.score) {
          bestFiller = {
            packageIndex,
            ...orientation,
            countX,
            countY,
            capacity,
            packedVolume,
            baseTop,
            zInset: (column.width - orientation.width) / 2,
            score,
          };
        }
      });
    });

    if (bestFiller) {
      column.filler = bestFiller;
      placedVolumes[bestFiller.packageIndex] += bestFiller.packedVolume;
      currentVolume += bestFiller.packedVolume;
    }
  });

  const totalSideGap = remainingMm / 1000;
  const maxVisiblePackages = 5000;
  const totalPackedPieces = columns.reduce((sum, column) => sum + column.capacity + (column.filler?.capacity || 0), 0);
  const actualCounts = packages.map((pkg, packageIndex) =>
    columns.reduce((sum, column) => {
      const baseCount = column.packageIndex === packageIndex ? column.capacity : 0;
      const fillerCount = column.filler?.packageIndex === packageIndex ? column.filler.capacity : 0;
      return sum + baseCount + fillerCount;
    }, 0)
  );
  const placements = [];
  let z = totalSideGap / 2;
  columns.forEach((column) => {
    const columnZ = z;
    for (let ix = 0; ix < column.countX && placements.length < maxVisiblePackages; ix += 1) {
      for (let iy = 0; iy < column.countY && placements.length < maxVisiblePackages; iy += 1) {
        placements.push({
          packageIndex: column.packageIndex,
          length: column.length,
          height: column.height,
          width: column.width,
          rotated: column.rotated,
          x: dimensions.length - (ix + 1) * column.length,
          y: iy * column.height,
          z: columnZ,
        });
      }
    }
    if (column.filler) {
      const filler = column.filler;
      for (let ix = 0; ix < filler.countX && placements.length < maxVisiblePackages; ix += 1) {
        for (let iy = 0; iy < filler.countY && placements.length < maxVisiblePackages; iy += 1) {
          placements.push({
            packageIndex: filler.packageIndex,
            length: filler.length,
            height: filler.height,
            width: filler.width,
            rotated: filler.rotated,
            x: dimensions.length - (ix + 1) * filler.length,
            y: filler.baseTop + iy * filler.height,
            z: columnZ + filler.zInset,
          });
        }
      }
    }
    z += column.width;
  });

  const rearDistance = (placement) => dimensions.length - placement.x - placement.length;
  const wallDepth = Math.max(0.1, Math.min(...packages.flatMap((pkg) => [pkg.length, pkg.width]).filter((size) => size > 0)));
  const wallGroups = new Map();
  placements.forEach((placement) => {
    const wallIndex = Math.floor((rearDistance(placement) + 1e-7) / wallDepth);
    if (!wallGroups.has(wallIndex)) wallGroups.set(wallIndex, []);
    wallGroups.get(wallIndex).push(placement);
  });
  const layers = [...wallGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => items.sort((a, b) => rearDistance(a) - rearDistance(b) || a.y - b.y || a.z - b.z || a.packageIndex - b.packageIndex));
  const actualShares = packages.map((pkg, index) => currentVolume > 0 ? (placedVolumes[index] / currentVolume) * 100 : 0);
  const maxShareDeviation = actualShares.reduce((max, share, index) => Math.max(max, Math.abs(share - packages[index].normalizedShare)), 0);
  const topGaps = columns.map((column) => {
    const filledTop = column.countY * column.height + (column.filler ? column.filler.countY * column.filler.height : 0);
    return dimensions.height - filledTop;
  });
  const endGaps = columns.map((column) => dimensions.length - column.countX * column.length);
  const usesLockPattern = columns.some((column, index) => index > 0 && (
    column.rotated !== columns[index - 1].rotated || column.packageIndex !== columns[index - 1].packageIndex
  ));

  return {
    placements,
    layers,
    wallDepth,
    containerLength: dimensions.length,
    targetCount: packages.reduce((sum, pkg) => sum + (volumeOf(pkg) > 0 ? Math.floor((totalVolume * pkg.normalizedShare) / 100 / volumeOf(pkg)) : 0), 0),
    overlapCount: 0,
    actualShares,
    maxShareDeviation,
    limited: totalPackedPieces > placements.length,
    packedPercent: totalVolume > 0 ? (currentVolume / totalVolume) * 100 : 0,
    actualCounts,
    totalPackedPieces,
    sideGapCm: totalSideGap * 50,
    betweenColumnGapCm: 0,
    lockPattern: usesLockPattern,
    columnCount: columns.length,
    topGapCm: Math.max(...topGaps) * 100,
    minEndGapCm: Math.min(...endGaps) * 100,
    maxEndGapCm: Math.max(...endGaps) * 100,
  };
}

function buildPackingPlan(packages, dimensions) {
  const cacheKey = JSON.stringify({ packages, dimensions });
  if (packingCache.key === cacheKey && packingCache.plan) return packingCache.plan;

  if (!packages.length || packages.every((pkg) => pkg.normalizedShare <= 1e-9)) {
    const plan = {
      placements: [],
      layers: [],
      wallDepth: 0,
      containerLength: dimensions.length,
      targetCount: 0,
      overlapCount: 0,
      actualShares: packages.map(() => 0),
      maxShareDeviation: 0,
      limited: false,
      packedPercent: 0,
      actualCounts: packages.map(() => 0),
      totalPackedPieces: 0,
    };
    packingCache = { key: cacheKey, plan };
    return plan;
  }

  const activeIndexes = packages
    .map((pkg, index) => ({ pkg, index }))
    .filter(({ pkg }) => pkg.normalizedShare > 1e-9)
    .map(({ index }) => index);
  if (activeIndexes.length > 0 && activeIndexes.length < packages.length) {
    const activePackages = activeIndexes.map((index) => packages[index]);
    const activePlan = buildPackingPlan(activePackages, dimensions);
    const remapPlacement = (placement) => ({ ...placement, packageIndex: activeIndexes[placement.packageIndex] });
    const actualCounts = packages.map(() => 0);
    const actualShares = packages.map(() => 0);
    activeIndexes.forEach((packageIndex, activeIndex) => {
      actualCounts[packageIndex] = activePlan.actualCounts[activeIndex] || 0;
      actualShares[packageIndex] = activePlan.actualShares[activeIndex] || 0;
    });
    const plan = {
      ...activePlan,
      placements: activePlan.placements.map(remapPlacement),
      layers: activePlan.layers.map((layer) => layer.map(remapPlacement)),
      actualCounts,
      actualShares,
      maxShareDeviation: actualShares.reduce((max, share, index) =>
        Math.max(max, Math.abs(share - packages[index].normalizedShare)), 0
      ),
    };
    packingCache = { key: cacheKey, plan };
    return plan;
  }

  if (packages.length === 1 && volumeOf(packages[0]) > 0) {
    const plan = buildSinglePackagePlan(packages[0], dimensions);
    packingCache = { key: cacheKey, plan };
    return plan;
  }
  if (packages.length > 1 && packages.every((pkg) => volumeOf(pkg) > 0)) {
    const plan = buildMixedColumnPlan(packages, dimensions);
    if (plan) {
      packingCache = { key: cacheKey, plan };
      return plan;
    }
  }

  const epsilon = 1e-7;
  const totalVolume = dimensions.length * dimensions.width * dimensions.height;
  const targetCounts = packages.map((pkg) =>
    volumeOf(pkg) > 0 ? Math.floor((totalVolume * pkg.normalizedShare) / 100 / volumeOf(pkg) + epsilon) : 0
  );
  const remaining = packages.map((pkg) =>
    volumeOf(pkg) > 0 ? Math.floor((totalVolume * (pkg.normalizedShare + 10)) / 100 / volumeOf(pkg) + epsilon) : 0
  );
  const targetCount = targetCounts.reduce((sum, count) => sum + count, 0);
  const placedVolumes = packages.map(() => 0);
  const minPackageHeight = Math.min(...packages.map((pkg) => pkg.height).filter((height) => height > 0));
  const minPackageWidth = Math.min(...packages.flatMap((pkg) => [pkg.length, pkg.width]).filter((width) => width > 0));
  let currentPackedVolume = 0;
  let spaces = [{ x: 0, y: 0, z: 0, length: dimensions.length, height: dimensions.height, width: dimensions.width }];
  const placements = [];
  const maxVisiblePackages = 5000;
  const packingDeadline = performance.now() + 650;

  while (spaces.length && placements.length < maxVisiblePackages && performance.now() < packingDeadline) {
    spaces.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z || a.length * a.height * a.width - b.length * b.height * b.width);
    const space = spaces.shift();
    const spaceVolume = space.length * space.height * space.width;
    let best = null;

    packages.forEach((pkg, packageIndex) => {
      if (remaining[packageIndex] <= 0 || volumeOf(pkg) <= 0) return;

      packageOrientations(pkg).forEach((orientation) => {
        if (
          orientation.length > space.length + epsilon ||
          orientation.height > space.height + epsilon ||
          orientation.width > space.width + epsilon
        ) return;

        const xPositions = [space.x];
        const zPositions = [...new Set([space.z, space.z + space.width - orientation.width])];
        xPositions.forEach((x) => zPositions.forEach((z) => {
          const position = { x, y: space.y, z };
          const candidateBox = { ...position, ...orientation };
          if (placements.some((placement) => placementsOverlap(candidateBox, placement, epsilon))) return;
          const contacts =
            (Math.abs(orientation.length - space.length) < epsilon ? 1 : 0) +
            (Math.abs(orientation.height - space.height) < epsilon ? 1 : 0) +
            (Math.abs(orientation.width - space.width) < epsilon ? 1 : 0);
          const wallContacts =
            (z < epsilon ? 1 : 0) +
            (Math.abs(z + orientation.width - dimensions.width) < epsilon ? 1 : 0);
          const fill = volumeOf(pkg) / spaceVolume;
          const packageVolume = volumeOf(pkg);
          const currentShare = currentPackedVolume > 0 ? (placedVolumes[packageIndex] / currentPackedVolume) * 100 : 0;
          const projectedShare = ((placedVolumes[packageIndex] + packageVolume) / (currentPackedVolume + packageVolume)) * 100;
          const ratioNeed = pkg.normalizedShare - currentShare;
          const overTolerance = Math.max(0, projectedShare - (pkg.normalizedShare + 2));
          const lateralFit = orientation.width / Math.max(orientation.width, space.width);
          const longitudinalFit = orientation.length / Math.max(orientation.length, space.length);
          const topGap = dimensions.height - position.y - orientation.height;
          const closesColumn = topGap >= -epsilon && topGap < minPackageHeight
            ? (1 - topGap / minPackageHeight) * 700
            : 0;
          const tolerancePenalty = overTolerance * (closesColumn > 0 ? 60 : 170);
          const compactWidthBonus = orientation.rotated ? 0 : 60;
          const sideRemainder = space.width - orientation.width;
          const deadSideGapPenalty = sideRemainder > epsilon && sideRemainder < minPackageWidth
            ? (1 - sideRemainder / minPackageWidth) * 1400
            : 0;
          const score = contacts * 1000 + lateralFit * 240 + longitudinalFit * 40 + wallContacts * 8 + fill * 100 + ratioNeed * 50 + closesColumn + compactWidthBonus - tolerancePenalty - deadSideGapPenalty + packageVolume;
          if (!best || score > best.score) best = { packageIndex, orientation, position, score };
        }));
      });
    });

    if (!best) continue;

    const { packageIndex, orientation, position } = best;
    placements.push({ packageIndex, ...orientation, ...position });
    remaining[packageIndex] -= 1;
    placedVolumes[packageIndex] += volumeOf(packages[packageIndex]);
    currentPackedVolume += volumeOf(packages[packageIndex]);

    const placed = { ...position, ...orientation };
    const placedTop = placed.y + placed.height;
    const nextSpaces = [];

    [space, ...spaces].forEach((current) => {
      if (!spacesIntersect(current, placed, epsilon)) {
        nextSpaces.push(current);
        return;
      }

      const currentRight = current.x + current.length;
      const currentTop = current.y + current.height;
      const currentFront = current.z + current.width;
      const placedRight = placed.x + placed.length;
      const placedFront = placed.z + placed.width;

      if (placed.x > current.x + epsilon) nextSpaces.push({ ...current, length: placed.x - current.x });
      if (placedRight < currentRight - epsilon) nextSpaces.push({ ...current, x: placedRight, length: currentRight - placedRight });
      if (placed.y > current.y + epsilon) nextSpaces.push({ ...current, height: placed.y - current.y });
      if (placed.z > current.z + epsilon) nextSpaces.push({ ...current, width: placed.z - current.z });
      if (placedFront < currentFront - epsilon) nextSpaces.push({ ...current, z: placedFront, width: currentFront - placedFront });
    });

    if (placedTop < dimensions.height - epsilon) {
      nextSpaces.push({
        x: placed.x,
        y: placedTop,
        z: placed.z,
        length: placed.length,
        height: dimensions.height - placedTop,
        width: placed.width,
      });
    }

    const boundedSpaces = nextSpaces.length > 320
      ? nextSpaces
        .sort((a, b) => a.y - b.y || b.length * b.height * b.width - a.length * a.height * a.width)
        .slice(0, 320)
      : nextSpaces;
    spaces = prunePackingSpaces(boundedSpaces, epsilon);
  }

  const topFillDeadline = performance.now() + 200;
  let addedTopPiece = true;
  while (addedTopPiece && placements.length < maxVisiblePackages && performance.now() < topFillDeadline) {
    addedTopPiece = false;
    let bestTop = null;

    placements.forEach((base) => {
      const y = base.y + base.height;
      packages.forEach((pkg, packageIndex) => {
        if (remaining[packageIndex] <= 0) return;
        packageOrientations(pkg).forEach((orientation) => {
          if (
            y + orientation.height > dimensions.height + epsilon
          ) return;

          const xPositions = [...new Set([base.x, base.x + base.length - orientation.length])];
          const zPositions = [...new Set([base.z, base.z + base.width - orientation.width])];
          xPositions.forEach((x) => zPositions.forEach((z) => {
            const candidate = { packageIndex, ...orientation, x, y, z };
            if (
              x < -epsilon || z < -epsilon ||
              x + orientation.length > dimensions.length + epsilon ||
              z + orientation.width > dimensions.width + epsilon ||
              supportCoverage({ x, y, z }, orientation, placements, epsilon) < 0.999
            ) return;
            if (placements.some((placement) => placementsOverlap(candidate, placement, epsilon))) return;
            const topGap = dimensions.height - y - orientation.height;
            const packageVolume = volumeOf(pkg);
            const projectedShare = ((placedVolumes[packageIndex] + packageVolume) / (currentPackedVolume + packageVolume)) * 100;
            const overTolerance = Math.max(0, projectedShare - (pkg.normalizedShare + 2));
            const score = -topGap * 1000 + packageVolume * 100 - overTolerance * 10;
            if (!bestTop || score > bestTop.score) bestTop = { ...candidate, score };
          }));
        });
      });
    });

    if (bestTop) {
      const { score, ...placement } = bestTop;
      placements.push(placement);
      remaining[placement.packageIndex] -= 1;
      placedVolumes[placement.packageIndex] += volumeOf(packages[placement.packageIndex]);
      currentPackedVolume += volumeOf(packages[placement.packageIndex]);
      addedTopPiece = true;
    }
  }

  placements.forEach((placement) => {
    placement.x = dimensions.length - placement.x - placement.length;
  });

  const packedVolume = placements.reduce((sum, placement) => sum + volumeOf(packages[placement.packageIndex]), 0);
  const actualShares = packages.map((pkg, index) => packedVolume > 0 ? (placedVolumes[index] / packedVolume) * 100 : 0);
  const maxShareDeviation = actualShares.reduce((max, share, index) => Math.max(max, Math.abs(share - packages[index].normalizedShare)), 0);
  let overlapCount = 0;
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (placementsOverlap(placements[i], placements[j], epsilon)) overlapCount += 1;
    }
  }
  const rearDistance = (placement) => dimensions.length - placement.x - placement.length;
  const wallDepth = Math.max(0.1, Math.min(...packages.flatMap((pkg) => [pkg.length, pkg.width]).filter((size) => size > 0)));
  const wallGroups = new Map();
  placements.forEach((placement) => {
    const wallIndex = Math.floor((rearDistance(placement) + epsilon) / wallDepth);
    if (!wallGroups.has(wallIndex)) wallGroups.set(wallIndex, []);
    wallGroups.get(wallIndex).push(placement);
  });
  const layers = [...wallGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, wallPlacements]) => wallPlacements.sort((a, b) => rearDistance(a) - rearDistance(b) || a.y - b.y || a.z - b.z || a.packageIndex - b.packageIndex));
  const plan = {
    placements,
    layers,
    wallDepth,
    containerLength: dimensions.length,
    targetCount,
    overlapCount,
    actualShares,
    maxShareDeviation,
    limited: placements.length < targetCount && (placements.length >= maxVisiblePackages || performance.now() >= packingDeadline),
    packedPercent: totalVolume > 0 ? (packedVolume / totalVolume) * 100 : 0,
    actualCounts: packages.map((pkg, index) => placements.reduce((count, placement) => count + (placement.packageIndex === index ? 1 : 0), 0)),
    totalPackedPieces: placements.length,
  };
  packingCache = { key: cacheKey, plan };
  return plan;
}

function updatePackingNavigator(packing, packages) {
  const layerCount = packing.layers.length;
  packingView.layerIndex = Math.max(0, Math.min(packingView.layerIndex, Math.max(0, layerCount - 1)));
  const layer = packing.layers[packingView.layerIndex] || [];
  packingView.stepIndex = Math.max(0, Math.min(packingView.stepIndex, Math.max(0, layer.length - 1)));

  els.layerLabel.textContent = layerCount ? `Stěna ${packingView.layerIndex + 1} z ${layerCount}` : "Bez stěny";
  els.stepLabel.textContent = layer.length ? `Krok ${packingView.stepIndex + 1} z ${layer.length}` : "Bez kroku";
  els.previousLayer.disabled = packingView.layerIndex <= 0;
  els.nextLayer.disabled = !layerCount || packingView.layerIndex >= layerCount - 1;
  els.previousStep.disabled = !layer.length || packingView.stepIndex <= 0;
  els.nextStep.disabled = !layer.length || packingView.stepIndex >= layer.length - 1;
  els.showAllPacking.classList.toggle("is-active", packingView.mode === "all");
  els.showLayerPacking.classList.toggle("is-active", packingView.mode === "layer");
  els.showStepPacking.classList.toggle("is-active", packingView.mode === "step");

  if (packingView.mode === "all") {
    const gapInfo = Number.isFinite(packing.sideGapCm)
      ? ` Mezi sloupci ${fmt(packing.betweenColumnGapCm, 1)} cm; u každé boční stěny zbývá ${fmt(packing.sideGapCm, 1)} cm, pod stropem ${fmt(packing.topGapCm, 1)} cm a u dveří podle sloupce ${fmt(packing.minEndGapCm, 1)}–${fmt(packing.maxEndGapCm, 1)} cm.${packing.lockPattern ? " Sloupce se střídají v otočení a vytvářejí podélný zámek." : ""}`
      : "";
    const actualMix = packages.map((pkg, index) => `${pkg.name} ${fmt(packing.actualShares[index], 1)} %`).join(" · ");
    els.placementDetail.textContent = packing.limited
      ? `3D náhled zobrazuje prvních ${packing.placements.length} z ${fmt(packing.totalPackedPieces, 0)} kusů. Celkový počet a zaplnění jsou dopočítané ze všech kusů.`
      : `Celý náklad: ${packing.totalPackedPieces} kusů v ${layerCount} stěnách. Skutečný mix: ${actualMix}.`;
    if (!packing.limited && gapInfo) els.placementDetail.textContent += gapInfo;
  } else if (packingView.mode === "layer") {
    const distanceFromRear = layer.length ? Math.max(0, (packing.containerLength - layer[0].x - layer[0].length) * 1000) : 0;
    const wallEnd = Math.min(packing.containerLength * 1000, distanceFromRear + packing.wallDepth * 1000);
    els.placementDetail.textContent = `Stěna obsahuje ${layer.length} kusů v pásmu ${fmt(distanceFromRear, 0)}–${fmt(wallEnd, 0)} mm od zadní stěny.`;
  } else if (layer.length) {
    const placement = layer[packingView.stepIndex];
    const pkg = packages[placement.packageIndex];
    const distanceFromRear = Math.max(0, (packing.containerLength - placement.x - placement.length) * 1000);
    const rotationInstruction = placement.rotated ? " Otočit o 90°." : " Bez otočení.";
    els.placementDetail.textContent = `${pkg.name}: ${fmt(distanceFromRear, 0)} mm od zadní stěny, ${fmt(placement.z * 1000, 0)} mm od levé stěny, ${fmt(placement.y * 1000, 0)} mm nad podlahou; půdorys ${fmt(placement.length * 1000, 0)} × ${fmt(placement.width * 1000, 0)} mm.${rotationInstruction}`;
  } else {
    els.placementDetail.textContent = "Pro zadané rozměry nelze umístit žádný kus.";
  }

  return layer;
}

function sizeWall2d(dimensions = containerDimensions()) {
  const parentRect = els.wall2d.parentElement.getBoundingClientRect();
  if (!parentRect.width || !parentRect.height) return;
  const availableWidth = Math.max(1, parentRect.width - 28);
  const availableHeight = Math.max(1, parentRect.height - 28);
  const ratio = dimensions.width / dimensions.height;
  const width = Math.min(availableWidth, availableHeight * ratio);
  const height = width / ratio;
  els.wall2d.style.width = `${width}px`;
  els.wall2d.style.height = `${height}px`;
}

function setExpandedView(expanded) {
  const allowed = els.visualArea.dataset.view === "three" || els.visualArea.dataset.view === "two";
  const next = Boolean(expanded && allowed);
  els.visualArea.classList.toggle("is-expanded", next);
  document.body.classList.toggle("visual-expanded", next);
  els.expandView.setAttribute("aria-pressed", String(next));
  els.expandView.setAttribute("aria-label", next ? "Zmenšit zobrazení" : "Roztáhnout zobrazení");
  els.expandView.title = next ? "Zmenšit zobrazení" : "Roztáhnout zobrazení";
  requestAnimationFrame(() => {
    sizeWall2d();
    drawThreeScene();
  });
}

function renderWall2d(placements, fullWall, packages, dimensions, overview = false) {
  els.wall2d.innerHTML = "";
  els.wall2d.classList.toggle("is-overview", overview);
  els.wall2d.style.aspectRatio = `${dimensions.width} / ${dimensions.height}`;

  placements.forEach((placement) => {
    const packageIndex = placement.packageIndex;
    const pkg = packages[packageIndex];
    const piece = document.createElement("div");
    const order = fullWall.indexOf(placement) + 1;
    piece.className = "wall-piece";
    piece.style.left = `${(placement.z / dimensions.width) * 100}%`;
    piece.style.bottom = `${(placement.y / dimensions.height) * 100}%`;
    piece.style.width = `${(placement.width / dimensions.width) * 100}%`;
    piece.style.height = `${(placement.height / dimensions.height) * 100}%`;
    piece.style.backgroundColor = colors[packageIndex % colors.length];
    piece.style.zIndex = String(Math.max(1, Math.round(placement.x * 1000)));
    piece.dataset.placementIndex = String(placement.manualIndex ?? "");
    piece.classList.toggle("is-selected", placement.manualIndex === state.selectedPlacementIndex);
    piece.classList.toggle("is-overlapping", Boolean(placement.isOverlapping));
    piece.textContent = String(order);
    piece.title = `${order}. ${pkg.name}${placement.rotated ? " – otočit o 90°" : ""}`;
    piece.setAttribute("aria-label", piece.title);
    els.wall2d.appendChild(piece);
  });
  sizeWall2d(dimensions);
}

function wallDepthSlices(placements, dimensions) {
  const groups = new Map();
  placements.forEach((placement) => {
    const distance = Math.max(0, dimensions.length - placement.x - placement.length);
    const key = Math.round(distance * 1000);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(placement);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([distance, items]) => ({
      distance,
      placements: items.sort((a, b) => a.y - b.y || a.z - b.z || a.packageIndex - b.packageIndex),
    }));
}

function manualStepMeters() {
  return Math.max(1, Math.min(500, numberValue(els.manualStep, manualStepDefaultMm))) / 1000;
}

function currentLayerPlacement() {
  if (!latestPacking) return null;
  const layer = latestPacking.layers[packingView.layerIndex] || [];
  return layer[packingView.stepIndex] || null;
}

function ensureManualPlan() {
  if (!latestPacking || !latestPacking.placements.length || latestPacking.limited) {
    state.manualMessage = latestPacking?.limited
      ? "Ruční úprava není dostupná u zkráceného náhledu."
      : "Nejdříve musí být v kontejneru aspoň jeden kus.";
    updateManualControls();
    return false;
  }
  const signature = layoutSignature();
  if (!state.manualPlan || state.manualPlan.signature !== signature) {
    state.manualPlan = {
      signature,
      placements: latestPacking.placements.map((placement) => clonePlacement(placement)),
    };
  }
  return true;
}

function updateManualControls() {
  if (!els.manualStatus) return;
  const hasSelection = Number.isInteger(state.selectedPlacementIndex) && latestPacking?.placements[state.selectedPlacementIndex];
  const manualActive = Boolean(state.manualPlan && state.manualPlan.signature === layoutSignature());
  const selectedPlacement = hasSelection ? latestPacking.placements[state.selectedPlacementIndex] : null;
  [
    els.manualRotate,
    els.manualAlign,
    els.manualLeft,
    els.manualRight,
    els.manualUp,
    els.manualDown,
    els.manualRear,
    els.manualDoor,
  ].forEach((button) => {
    button.disabled = !hasSelection;
  });
  els.manualAllowOverlap.disabled = !hasSelection;
  els.manualAllowOverlap.checked = Boolean(selectedPlacement?.allowOverlap);
  els.manualReset.disabled = !manualActive;
  els.manualStatus.textContent = state.manualMessage || (hasSelection
    ? `Vybrán kus ${state.selectedPlacementIndex + 1}.`
    : "Klikni na kus ve 2D stěně nebo vyber aktuální krok.");
}

function selectPlacement(index) {
  if (!latestPacking || !latestPacking.placements[index]) return;
  state.selectedPlacementIndex = index;
  state.manualMessage = `Vybrán kus ${index + 1}.`;
  updateManualControls();
  renderThreeScene(normalizedPackages(), containerDimensions(), latestPacking);
}

function placementFits(candidate, placements, dimensions, selectedIndex) {
  const epsilon = 1e-7;
  if (
    candidate.x < -epsilon ||
    candidate.y < -epsilon ||
    candidate.z < -epsilon ||
    candidate.x + candidate.length > dimensions.length + epsilon ||
    candidate.y + candidate.height > dimensions.height + epsilon ||
    candidate.z + candidate.width > dimensions.width + epsilon
  ) {
    return "Kus by byl mimo kontejner.";
  }
  const overlap = placements.some((placement, index) =>
    index !== selectedIndex && placementsOverlap(candidate, placement, epsilon)
  );
  if (overlap && !candidate.allowOverlap) return "Kus by se překrýval s jiným obalem. Nejdřív u vybraného kusu povol překrytí.";
  if (supportCoverage({ x: candidate.x, y: candidate.y, z: candidate.z }, candidate, placements.filter((_, index) => index !== selectedIndex), epsilon) < 0.98) {
    return "Kus by neměl dostatečnou podporu zespodu.";
  }
  return "";
}

function overlapVolume(a, b) {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const z = Math.max(0, Math.min(a.z + a.width, b.z + b.width) - Math.max(a.z, b.z));
  return x * y * z;
}

function placementOverlapVolume(candidate, placements, selectedIndex) {
  return placements.reduce((sum, placement, index) =>
    index === selectedIndex ? sum : sum + overlapVolume(candidate, placement), 0
  );
}

function clampPlacement(candidate, dimensions) {
  return {
    ...candidate,
    x: Math.max(0, Math.min(Math.max(0, dimensions.length - candidate.length), candidate.x)),
    y: Math.max(0, Math.min(Math.max(0, dimensions.height - candidate.height), candidate.y)),
    z: Math.max(0, Math.min(Math.max(0, dimensions.width - candidate.width), candidate.z)),
  };
}

function nearestSnapValues(values, desired, maxItems) {
  const unique = [...new Set(values
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.round(value * 10000) / 10000))]
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)
    .slice(0, maxItems);
  return unique.length ? unique : [desired];
}

function axisSnapValues(axis, sizeKey, candidate, current, placements, dimensions, selectedIndex, maxItems) {
  const limit = axis === "x" ? dimensions.length : axis === "y" ? dimensions.height : dimensions.width;
  const size = candidate[sizeKey];
  const desired = candidate[axis];
  const values = [desired, current[axis], 0, limit - size];
  placements.forEach((placement, index) => {
    if (index === selectedIndex) return;
    const placementSize = placement[sizeKey];
    values.push(
      placement[axis],
      placement[axis] + placementSize,
      placement[axis] - size,
      placement[axis] + placementSize - size
    );
  });
  return nearestSnapValues(values.map((value) => Math.max(0, Math.min(Math.max(0, limit - size), value))), desired, maxItems);
}

function bestManualCandidate(baseCandidate, current, placements, dimensions, selectedIndex) {
  const candidate = clampPlacement(baseCandidate, dimensions);
  const xValues = axisSnapValues("x", "length", candidate, current, placements, dimensions, selectedIndex, 12);
  const yValues = axisSnapValues("y", "height", candidate, current, placements, dimensions, selectedIndex, 8);
  const zValues = axisSnapValues("z", "width", candidate, current, placements, dimensions, selectedIndex, 12);
  let best = null;

  xValues.forEach((x) => yValues.forEach((y) => zValues.forEach((z) => {
    const option = { ...candidate, x, y, z };
    const overlap = placementOverlapVolume(option, placements, selectedIndex);
    const support = supportCoverage({ x, y, z }, option, placements.filter((_, index) => index !== selectedIndex), 1e-7);
    const move = Math.abs(option.x - current.x) + Math.abs(option.y - current.y) + Math.abs(option.z - current.z);
    const wallContact =
      (option.x <= 1e-7 ? 1 : 0) +
      (option.z <= 1e-7 ? 1 : 0) +
      (Math.abs(option.x + option.length - dimensions.length) <= 1e-7 ? 1 : 0) +
      (Math.abs(option.z + option.width - dimensions.width) <= 1e-7 ? 1 : 0);
    const unsupportedPenalty = support < 0.98 ? (0.98 - support) * 100000 : 0;
    const forbiddenOverlapPenalty = option.allowOverlap ? 0 : (overlap > 1e-9 ? 1000000000 : 0);
    const score = forbiddenOverlapPenalty + overlap * 10000000 + unsupportedPenalty + move * 20 - wallContact * 0.5;
    if (!best || score < best.score) best = { placement: option, score, overlap, support };
  })));

  return best || { placement: candidate, score: 0, overlap: placementOverlapVolume(candidate, placements, selectedIndex), support: 1 };
}

function overlapNote(overlap) {
  return overlap > 1e-9 ? " Překryv je ponechaný a označený šrafováním." : "";
}

function tryUpdateSelectedPlacement(candidate, successMessage = "Ruční úprava uložena v aktuálním plánu.") {
  if (!ensureManualPlan()) return;
  const index = state.selectedPlacementIndex;
  if (!Number.isInteger(index) || !state.manualPlan.placements[index]) return;
  const dimensions = containerDimensions();
  const placements = state.manualPlan.placements.map((placement) => clonePlacement(placement));
  candidate.allowOverlap = Boolean(state.manualPlan.placements[index].allowOverlap || candidate.allowOverlap);
  const error = placementFits(candidate, placements, dimensions, index);
  if (error) {
    state.manualMessage = error;
    updateManualControls();
    return;
  }
  state.manualPlan.placements[index] = clonePlacement(candidate);
  state.manualMessage = successMessage;
  saveActiveLayout();
  render();
}

function applyBestSelectedPlacement(baseCandidate, successMessage) {
  if (!ensureManualPlan()) return;
  const index = state.selectedPlacementIndex;
  const current = state.manualPlan.placements[index];
  if (!current) return;
  const dimensions = containerDimensions();
  const placements = state.manualPlan.placements.map((placement) => clonePlacement(placement));
  const allowed = Boolean(current.allowOverlap || baseCandidate.allowOverlap);
  const best = bestManualCandidate({ ...baseCandidate, allowOverlap: allowed }, current, placements, dimensions, index);
  tryUpdateSelectedPlacement(best.placement, `${successMessage}${overlapNote(best.overlap)}`);
}

function setSelectedOverlapPermission(allowed) {
  if (!ensureManualPlan()) return;
  const index = state.selectedPlacementIndex;
  if (!Number.isInteger(index) || !state.manualPlan.placements[index]) return;
  const placements = state.manualPlan.placements.map((placement) => clonePlacement(placement));
  const selected = { ...placements[index], allowOverlap: Boolean(allowed) };
  const overlapsNow = placements.some((placement, placementIndex) =>
    placementIndex !== index && placementsOverlap(selected, placement, 1e-7)
  );
  if (!allowed && overlapsNow) {
    state.manualPlan.placements[index].allowOverlap = true;
    state.manualMessage = "Kus se ještě překrývá. Nejdřív ho posuň mimo překrytí, potom jde povolení vypnout.";
    updateManualControls();
    return;
  }
  state.manualPlan.placements[index].allowOverlap = Boolean(allowed);
  state.manualMessage = allowed
    ? "Překrytí je povolené jen pro vybraný kus. Překryté obaly budou šrafované."
    : "Překrytí pro vybraný kus je vypnuté.";
  saveActiveLayout();
  render();
}

function moveSelectedPlacement(dx, dy, dz) {
  if (!ensureManualPlan()) return;
  const index = state.selectedPlacementIndex;
  const placement = state.manualPlan.placements[index];
  if (!placement) return;
  tryUpdateSelectedPlacement({
    ...placement,
    x: placement.x + dx,
    y: placement.y + dy,
    z: placement.z + dz,
  });
}

function rotateSelectedPlacement() {
  if (!ensureManualPlan()) return;
  const index = state.selectedPlacementIndex;
  const placement = state.manualPlan.placements[index];
  if (!placement) return;
  const centerX = placement.x + placement.length / 2;
  const centerZ = placement.z + placement.width / 2;
  const rotated = {
    ...placement,
    length: placement.width,
    width: placement.length,
    rotated: !placement.rotated,
  };
  rotated.x = centerX - rotated.length / 2;
  rotated.z = centerZ - rotated.width / 2;
  const dimensions = containerDimensions();
  rotated.x = Math.max(0, Math.min(dimensions.length - rotated.length, rotated.x));
  rotated.z = Math.max(0, Math.min(dimensions.width - rotated.width, rotated.z));
  applyBestSelectedPlacement(rotated, "Otočeno o 90° a posunuto na nejmenší možný konflikt.");
}

function alignSelectedPlacement() {
  if (!ensureManualPlan()) return;
  const index = state.selectedPlacementIndex;
  const placement = state.manualPlan.placements[index];
  if (!placement) return;
  applyBestSelectedPlacement({ ...placement }, "Zarovnáno k nejbližším vhodným hranám bez změny otočení.");
}

function resetManualPlan() {
  state.manualPlan = null;
  state.selectedPlacementIndex = null;
  state.manualMessage = "Ruční úpravy jsou zrušené, platí automatický výpočet.";
  saveActiveLayout();
  render();
}

function renderThreeScene(packages, dimensions, packing = buildPackingPlan(packages, dimensions)) {
  if (!initThreeScene()) return;

  const scale = 6 / dimensions.length;
  const length = dimensions.length * scale;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;

  clearGroup(threeState.fillGroup);
  clearGroup(threeState.edgesGroup);

  const containerGeometry = new THREE.BoxGeometry(length, height, width);
  const containerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.08,
    roughness: 0.6,
    metalness: 0.1,
  });
  threeState.containerMesh = new THREE.Mesh(containerGeometry, containerMaterial);
  threeState.edgesGroup.add(threeState.containerMesh);

  const edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(containerGeometry),
    new THREE.LineBasicMaterial({ color: 0x202522, transparent: true, opacity: 0.85 })
  );
  threeState.edgesGroup.add(edgeLines);

  const floorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.018, width),
    new THREE.MeshBasicMaterial({ color: 0x303a36, transparent: true, opacity: 0.32 })
  );
  floorPanel.position.y = -height / 2 - 0.012;
  threeState.edgesGroup.add(floorPanel);

  const ceilingPanel = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.012, width),
    new THREE.MeshBasicMaterial({ color: 0x8fc8d8, transparent: true, opacity: 0.12 })
  );
  ceilingPanel.position.y = height / 2 + 0.012;
  threeState.edgesGroup.add(ceilingPanel);

  const currentLayer = updatePackingNavigator(packing, packages);
  const depthSlices = wallDepthSlices(currentLayer, dimensions);
  if (packingView.mode === "step" && currentLayer.length) {
    const activePlacement = currentLayer[packingView.stepIndex];
    const activeSlice = depthSlices.findIndex((slice) => slice.placements.includes(activePlacement));
    if (activeSlice >= 0) packingView.depthIndex = activeSlice;
  }
  packingView.depthIndex = Math.max(-1, Math.min(packingView.depthIndex, Math.max(-1, depthSlices.length - 1)));
  const currentDepth = packingView.depthIndex >= 0 ? depthSlices[packingView.depthIndex] : null;
  els.depthLabel.textContent = currentDepth
    ? `Řez ${packingView.depthIndex + 1} z ${depthSlices.length} · ${currentDepth.distance} mm`
    : depthSlices.length ? `Přehled · ${depthSlices.length} řezů` : "Bez řezu";
  els.previousDepth.disabled = packingView.depthIndex < 0;
  els.nextDepth.disabled = !depthSlices.length || packingView.depthIndex >= depthSlices.length - 1;
  els.visualArea.dataset.depthSlices = String(depthSlices.length);
  const completedLayers = packing.layers.slice(0, packingView.layerIndex).flat();
  const currentWallPlacements = packingView.mode === "step"
    ? currentLayer.slice(0, packingView.stepIndex + 1)
    : currentLayer;
  const visiblePlacements = packingView.mode === "all"
    ? packing.placements
    : packingView.mode === "layer"
      ? [...completedLayers, ...currentLayer]
      : [...completedLayers, ...currentLayer.slice(0, packingView.stepIndex + 1)];
  const wall2dPlacements = packingView.mode === "step"
    ? currentWallPlacements.filter((placement) => currentDepth?.placements.includes(placement))
    : currentDepth?.placements || currentLayer;
  renderWall2d(wall2dPlacements, currentLayer, packages, dimensions, !currentDepth && packingView.mode !== "step");
  packages.forEach((pkg, index) => {
    const packagePlacements = visiblePlacements.filter((placement) => placement.packageIndex === index);
    if (!packagePlacements.length) return;

    [
      { placements: packagePlacements.filter((placement) => !placement.isOverlapping), hatched: false },
      { placements: packagePlacements.filter((placement) => placement.isOverlapping), hatched: true },
    ].forEach((batch) => {
      if (!batch.placements.length) return;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: createPackageTexture(colors[index % colors.length], batch.hatched),
      });
      const boxes = new THREE.InstancedMesh(geometry, material, batch.placements.length);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const boxScale = new THREE.Vector3();
      const shade = new THREE.Color();

      batch.placements.forEach((placement, instanceIndex) => {
        position.set(
          (placement.x + placement.length / 2 - dimensions.length / 2) * scale,
          (placement.y + placement.height / 2 - dimensions.height / 2) * scale,
          (placement.z + placement.width / 2 - dimensions.width / 2) * scale
        );
        boxScale.set(placement.length * scale, placement.height * scale, placement.width * scale);
        matrix.compose(position, rotation, boxScale);
        boxes.setMatrixAt(instanceIndex, matrix);
        const shadeValue = batch.hatched ? 1 : (instanceIndex % 2 === 0 ? 1 : 0.96);
        shade.setRGB(shadeValue, shadeValue, shadeValue);
        boxes.setColorAt(instanceIndex, shade);
      });

      boxes.instanceMatrix.needsUpdate = true;
      boxes.instanceColor.needsUpdate = true;
      threeState.fillGroup.add(boxes);
    });
  });

  const selectedPlacement = Number.isInteger(state.selectedPlacementIndex)
    ? visiblePlacements.find((placement) => placement.manualIndex === state.selectedPlacementIndex)
    : null;
  if (selectedPlacement) {
    const highlightGeometry = new THREE.BoxGeometry(
      selectedPlacement.length * scale * 1.025,
      selectedPlacement.height * scale * 1.025,
      selectedPlacement.width * scale * 1.025
    );
    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(highlightGeometry),
      new THREE.LineBasicMaterial({ color: 0xfff200, transparent: true, opacity: 1 })
    );
    highlight.position.set(
      (selectedPlacement.x + selectedPlacement.length / 2 - dimensions.length / 2) * scale,
      (selectedPlacement.y + selectedPlacement.height / 2 - dimensions.height / 2) * scale,
      (selectedPlacement.z + selectedPlacement.width / 2 - dimensions.width / 2) * scale
    );
    threeState.edgesGroup.add(highlight);
  }

  els.visualArea.dataset.visiblePackages = String(visiblePlacements.length);
  els.visualArea.dataset.packedPackages = String(packing.totalPackedPieces);
  els.visualArea.dataset.targetPackages = String(packing.targetCount);
  els.visualArea.dataset.packedPercent = packing.packedPercent.toFixed(1);
  els.visualArea.dataset.overlapCount = String(packing.overlapCount);
  els.visualArea.dataset.shareDeviation = packing.maxShareDeviation.toFixed(2);
  els.visualArea.dataset.sideGapCm = Number.isFinite(packing.sideGapCm) ? packing.sideGapCm.toFixed(1) : "";
  els.visualArea.dataset.betweenColumnGapCm = Number.isFinite(packing.betweenColumnGapCm) ? packing.betweenColumnGapCm.toFixed(1) : "";
  els.visualArea.dataset.lockPattern = packing.lockPattern ? "true" : "false";
  els.visualArea.dataset.topGapCm = Number.isFinite(packing.topGapCm) ? packing.topGapCm.toFixed(1) : "";
  els.visualArea.dataset.minEndGapCm = Number.isFinite(packing.minEndGapCm) ? packing.minEndGapCm.toFixed(1) : "";
  els.visualArea.dataset.maxEndGapCm = Number.isFinite(packing.maxEndGapCm) ? packing.maxEndGapCm.toFixed(1) : "";
  els.visualArea.dataset.manualActive = packing.manualActive ? "true" : "false";
  updateManualControls();

  drawThreeScene();
}

function drawThreeScene() {
  if (!threeState.ready) return;

  els.visualArea.dataset.zoom = threeState.zoom.toFixed(2);
  els.visualArea.dataset.rotationX = threeState.rotationX.toFixed(3);
  els.visualArea.dataset.rotationY = threeState.rotationY.toFixed(3);

  const rect = els.canvas3d.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  threeState.renderer.setSize(width, height, false);
  threeState.camera.aspect = width / height;
  const framingScale = Math.max(0.9, 0.84 / threeState.camera.aspect);
  const zoomedFraming = framingScale / threeState.zoom;
  threeState.camera.position.set(7.5 * zoomedFraming, 1.8 * zoomedFraming, 7.2 * zoomedFraming);
  threeState.camera.lookAt(0, 0, 0);
  threeState.camera.updateProjectionMatrix();

  threeState.root.rotation.x = threeState.rotationX;
  threeState.root.rotation.y = threeState.rotationY;
  threeState.renderer.render(threeState.scene, threeState.camera);
  sizeWall2d();
}

function normalizeShares() {
  syncStateFromDom();
  state.container = {
    length: Math.max(0.1, Math.min(100, numberValue(els.containerLength, state.container.length))),
    width: Math.max(0.1, Math.min(100, numberValue(els.containerWidth, state.container.width))),
    height: Math.max(0.1, Math.min(100, numberValue(els.containerHeight, state.container.height))),
  };
  els.confirmLayout.classList.remove("is-pending");
  if (state.distributionMode === "pieces") {
    const enteredVolume = state.packages.reduce((sum, pkg) => sum + Math.max(0, pkg.pieces) * volumeOf(pkg), 0);
    if (enteredVolume > 0) {
      const scale = containerVolume() / enteredVolume;
      state.packages = state.packages.map((pkg) => ({
        ...pkg,
        pieces: Math.max(0, Math.round(pkg.pieces * scale)),
      }));
    }
    renderPackageCards();
    render();
    saveActiveLayout();
    return;
  }
  const packages = normalizedPackages();
  state.packages = packages.map((pkg) => ({ ...pkg, share: Number(pkg.normalizedShare.toFixed(1)) }));
  renderPackageCards();
  render();
  saveActiveLayout();
}

function resetDemo() {
  state.distributionMode = "percent";
  state.container = { length: 5.9, width: 2.35, height: 2.39 };
  packingView.mode = "all";
  packingView.layerIndex = 0;
  packingView.stepIndex = 0;
  packingView.depthIndex = 0;
  state.manualPlan = null;
  state.selectedPlacementIndex = null;
  state.manualMessage = "";
  state.currentJobId = "";
  state.currentJobName = "";
  state.packages = createDefaultPackages(state.catalog);
  document.body.dataset.distributionMode = state.distributionMode;
  els.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.distributionMode));
  els.containerLength.value = 5.9;
  els.containerWidth.value = 2.35;
  els.containerHeight.value = 2.39;
  els.confirmLayout.classList.remove("is-pending");
  renderPackageCards();
  render();
  saveActiveLayout();
}

els.packages.addEventListener("input", markLayoutPending);
els.packages.addEventListener("change", (event) => {
  if (!event.target.matches(".package-type-select")) return;
  const catalogItem = state.catalog.find((item) => item.id === event.target.value);
  if (!catalogItem) {
    markLayoutPending();
    return;
  }
  const card = event.target.closest(".package-card");
  card.querySelector(".package-name").value = catalogItem.name;
  card.querySelector(".pkg-length").value = Math.round(catalogItem.length * 1000);
  card.querySelector(".pkg-width").value = Math.round(catalogItem.width * 1000);
  card.querySelector(".pkg-height").value = Math.round(catalogItem.height * 1000);
  markLayoutPending();
});
els.packages.addEventListener("click", (event) => {
  if (!event.target.matches(".remove-package")) return;
  const draftPackages = [...els.packages.querySelectorAll(".package-card")].map(readPackageCard);
  const index = Number.parseInt(event.target.closest(".package-card").dataset.index, 10);
  draftPackages.splice(index, 1);
  renderDraftPackageCards(draftPackages);
  markLayoutPending();
});

[els.containerLength, els.containerWidth, els.containerHeight].forEach((input) => {
  input.addEventListener("input", markLayoutPending);
});

els.addPackage.addEventListener("click", () => {
  const draftPackages = [...els.packages.querySelectorAll(".package-card")].map(readPackageCard);
  const catalogItem = state.catalog[0];
  draftPackages.push(catalogItem
    ? { ...catalogItem, catalogId: catalogItem.id, share: draftPackages.length ? 10 : 100, pieces: 0 }
    : { catalogId: null, name: `Obal ${draftPackages.length + 1}`, length: 0.4, width: 0.3, height: 0.25, share: draftPackages.length ? 10 : 100, pieces: 0 });
  renderDraftPackageCards(draftPackages);
  markLayoutPending();
});

els.confirmLayout.addEventListener("click", confirmLayout);
els.normalizeShares.addEventListener("click", normalizeShares);
els.resetDemo.addEventListener("click", resetDemo);
els.saveJob.addEventListener("click", saveJob);
els.loadJob.addEventListener("click", loadSelectedJob);
els.deleteJob.addEventListener("click", deleteSelectedJob);
els.jobSelect.addEventListener("change", renderJobs);
els.manualSelectStep.addEventListener("click", () => {
  const placement = currentLayerPlacement();
  if (placement) selectPlacement(placement.manualIndex);
});
els.manualRotate.addEventListener("click", rotateSelectedPlacement);
els.manualAlign.addEventListener("click", alignSelectedPlacement);
els.manualLeft.addEventListener("click", () => moveSelectedPlacement(0, 0, -manualStepMeters()));
els.manualRight.addEventListener("click", () => moveSelectedPlacement(0, 0, manualStepMeters()));
els.manualUp.addEventListener("click", () => moveSelectedPlacement(0, manualStepMeters(), 0));
els.manualDown.addEventListener("click", () => moveSelectedPlacement(0, -manualStepMeters(), 0));
els.manualRear.addEventListener("click", () => moveSelectedPlacement(manualStepMeters(), 0, 0));
els.manualDoor.addEventListener("click", () => moveSelectedPlacement(-manualStepMeters(), 0, 0));
els.manualReset.addEventListener("click", resetManualPlan);
els.manualAllowOverlap.addEventListener("change", () => setSelectedOverlapPermission(els.manualAllowOverlap.checked));
els.wall2d.addEventListener("click", (event) => {
  const piece = event.target.closest(".wall-piece");
  if (!piece) return;
  const index = Number.parseInt(piece.dataset.placementIndex, 10);
  if (Number.isInteger(index)) selectPlacement(index);
});
els.zoomOut.addEventListener("click", () => {
  threeState.zoom = Math.max(0.65, threeState.zoom / 1.18);
  drawThreeScene();
});
els.zoomIn.addEventListener("click", () => {
  threeState.zoom = Math.min(2.5, threeState.zoom * 1.18);
  drawThreeScene();
});
els.frontView.addEventListener("click", () => {
  threeState.rotationX = 0;
  threeState.rotationY = -Math.atan2(7.2, 7.5);
  drawThreeScene();
});
els.resetView.addEventListener("click", () => {
  threeState.rotationX = 0;
  threeState.rotationY = 0.72;
  threeState.zoom = 1;
  drawThreeScene();
});
els.expandView.addEventListener("click", () => {
  setExpandedView(!els.visualArea.classList.contains("is-expanded"));
});
els.showAllPacking.addEventListener("click", () => {
  packingView.mode = "all";
  render();
});
els.showLayerPacking.addEventListener("click", () => {
  packingView.mode = "layer";
  render();
});
els.showStepPacking.addEventListener("click", () => {
  packingView.mode = "step";
  render();
});
els.previousLayer.addEventListener("click", () => {
  packingView.mode = "layer";
  packingView.layerIndex -= 1;
  packingView.stepIndex = 0;
  packingView.depthIndex = 0;
  render();
});
els.nextLayer.addEventListener("click", () => {
  packingView.mode = "layer";
  packingView.layerIndex += 1;
  packingView.stepIndex = 0;
  packingView.depthIndex = 0;
  render();
});
els.previousStep.addEventListener("click", () => {
  packingView.mode = "step";
  packingView.stepIndex -= 1;
  render();
});
els.nextStep.addEventListener("click", () => {
  packingView.mode = "step";
  packingView.stepIndex += 1;
  render();
});
els.previousDepth.addEventListener("click", () => {
  packingView.depthIndex -= 1;
  render();
});
els.nextDepth.addEventListener("click", () => {
  packingView.depthIndex += 1;
  render();
});
els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.distributionMode = button.dataset.mode;
    document.body.dataset.distributionMode = state.distributionMode;
    els.modeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});
els.viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    els.viewTabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    els.visualArea.dataset.view = tab.dataset.view;
    if (tab.dataset.view === "volume") setExpandedView(false);
    sizeWall2d();
    drawThreeScene();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.visualArea.classList.contains("is-expanded")) setExpandedView(false);
});

let plannerInitialized = false;
function initializePlanner() {
  if (plannerInitialized) return;
  plannerInitialized = true;
  document.body.dataset.distributionMode = state.distributionMode;
  els.containerLength.value = state.container.length;
  els.containerWidth.value = state.container.width;
  els.containerHeight.value = state.container.height;
  els.manualStep.value = manualStepDefaultMm;
  els.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.distributionMode));
  renderPackageCards();
  renderJobs();
  render();
  loadJobs();
  if (needsCatalogRecovery) saveActiveLayout();
}

window.addEventListener("planner-authenticated", initializePlanner, { once: true });
if (window.__authenticatedUser) initializePlanner();
