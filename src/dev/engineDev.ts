// Test page for the engine alone (group B): opens a DWG / DXF / PNG / JPG from the file picker or from
// ?src=<url>, and exposes window.__dbg for scripted checks. Not part of the app.
import { createCadEngine, type FatcatCadEngine } from "../viewer/cadEngine";
import { convertDwgToDxf, conversionWarnings } from "../dwg/convertDwg";
import type { AppError } from "../types/errors";
import type { ViewCommand } from "../types/drawing";

type Debug = {
  engine: FatcatCadEngine | null;
  state: "idle" | "converting" | "loading" | "ready" | "error";
  error: { code?: string; message: string; diagnostics?: unknown } | null;
  timings: { convertMs?: number; loadMs?: number };
  stages: string[];
  file: File | null;
  open(url: string): Promise<void>;
  summary(): Record<string, unknown> | null;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = $("host"), status = $("status"), spaceSelect = $<HTMLSelectElement>("space"), layersBox = $("layers");
const dbg: Debug = {
  engine: null, state: "idle", error: null, timings: {}, stages: [], file: null,
  open: (url) => openUrl(url),
  summary() {
    const e = dbg.engine;
    if (!e || !e.isReady()) return null;
    const index = e.measurementIndex(), report = e.report();
    const a = e.unproject(0, 0), b = e.unproject(host.clientWidth, host.clientHeight);
    return {
      space: e.currentSpace(), spaces: e.spaces().map((s) => s.name), viewKey: e.viewKey(),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, width: b.x - a.x, ppu: e.pixelsPerUnit(),
      entities: index?.entities.length ?? 0, snaps: index?.snaps.length ?? 0, layers: report?.layers.length ?? 0,
      blockLayers: report?.blockLayers?.length ?? 0, warnings: report?.warnings ?? [], entityCount: report?.entityCount ?? 0,
      buildMs: report?.buildMs, images: report?.images, shownImageCount: report?.shownImageCount,
      conversionDiagnostics: dbg.file ? conversionWarnings.get(dbg.file) ?? 0 : 0,
    };
  },
};
(window as unknown as { __dbg: Debug }).__dbg = dbg;

let serial = 0;
async function openFile(source: File): Promise<void> {
  const mine = ++serial;
  dbg.engine?.dispose();
  dbg.engine = null;
  dbg.error = null; dbg.timings = {}; dbg.stages = [];
  host.replaceChildren();
  try {
    let file = source;
    if (/\.dwg$/i.test(source.name)) {
      dbg.state = "converting"; status.textContent = "正在轉換 DWG…";
      const t = performance.now();
      file = await convertDwgToDxf(source);
      dbg.timings.convertMs = Math.round(performance.now() - t);
    }
    if (mine !== serial) return;
    dbg.file = file;
    dbg.state = "loading";
    const engine = createCadEngine(host);
    dbg.engine = engine;
    engine.onError((e) => { dbg.state = "error"; dbg.error = { code: e.code, message: e.message }; status.textContent = "錯誤：" + e.code; });
    const t = performance.now();
    await engine.load(file, (stage) => { if (dbg.stages.at(-1) !== stage) dbg.stages.push(stage); status.textContent = stage; });
    if (mine !== serial) return;
    dbg.timings.loadMs = Math.round(performance.now() - t);
    dbg.state = "ready";
    status.textContent = `${source.name}：${dbg.timings.convertMs ?? 0} + ${dbg.timings.loadMs} ms`;
    fillSpaces();
    fillLayers();
  } catch (error) {
    if (mine !== serial) return;
    dbg.state = "error";
    const e = error as AppError;
    dbg.error = { code: e.code, message: e.message, diagnostics: e.diagnostics };
    status.textContent = "錯誤：" + (e.code ?? e.message);
  }
}

async function openUrl(url: string): Promise<void> {
  const response = await fetch(url);
  const name = decodeURIComponent(url.split("/").pop()!.split("?")[0]);
  await openFile(new File([await response.blob()], name));
}

function fillSpaces(): void {
  const e = dbg.engine!;
  spaceSelect.replaceChildren(...e.spaces().map((s) => new Option(s.name === "Model" ? "模型（Model）" : s.name, s.name, false, s.name === e.currentSpace())));
}

function fillLayers(): void {
  const report = dbg.engine?.report();
  layersBox.replaceChildren(...(report?.layers ?? []).map((l) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = l.visible;
    box.onchange = () => { void dbg.engine?.showLayer(l.name, box.checked).then((rebuilt) => { if (rebuilt) fillLayers(); }); };
    label.append(box, " " + l.name);
    label.style.display = "block";
    return label;
  }));
}

spaceSelect.onchange = async () => {
  const e = dbg.engine, file = dbg.file;
  if (!e || !file) return;
  status.textContent = "切換中…";
  try { await e.load(file, () => {}, spaceSelect.value); status.textContent = spaceSelect.value; fillLayers(); }
  catch (error) { status.textContent = "錯誤：" + String((error as AppError).code ?? error); }
};
$<HTMLInputElement>("pick").onchange = (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) void openFile(f); };
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-cmd]")) b.onclick = () => dbg.engine?.command(b.dataset.cmd as ViewCommand);
$("toggle-layers").onclick = () => { layersBox.style.display = layersBox.style.display === "block" ? "none" : "block"; };
const src = new URLSearchParams(location.search).get("src");
if (src) void openUrl(src);
