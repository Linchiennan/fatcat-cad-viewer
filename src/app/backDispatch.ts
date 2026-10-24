// What one press of Back / Esc does in the App (T10 4.3-4, with approved fixes 待決 5 and 19). Owner: P4 group D.
// Also the stack of back handlers: nested ones (library overlay, recovery screen) run before the App's own.

export type ShellScreen = "home" | "loading" | "viewing" | "error";

/** Everything the App's main back handler looks at (nested handlers such as the library run before it). */
export type ShellBackState = {
  screen: ShellScreen;
  closeConfirmOpen: boolean;
  /** A general confirm dialog (clear measurements, delete all markups). */
  confirmOpen: boolean;
  /** Export dialog, area selection or export note on screen. */
  exportOpen: boolean;
  markupTextOpen: boolean;
  marking: boolean;
  selecting?: boolean;
  searchPanelOpen: boolean;
  hasSearchResults: boolean;
  libraryOpen: boolean;
  cadPanelOpen: boolean;
  measuring: boolean;
  inspecting: boolean;
  /** Android app (Back on the home screen leaves the app); false for the web. */
  nativeApp: boolean;
};

export type BackAction =
  | "close-close-confirm" | "close-confirm" | "close-export" | "close-markup-text" | "end-markup"
  | "close-search-panel" | "clear-search" | "close-library" | "close-cad-panel" | "end-measure"
  | "end-selection" | "ask-close-drawing" | "go-home" | "exit-app" | "none";

/**
 * First matching rule wins: close-confirm, general confirm, export, markup text, markup mode, search panel,
 * search results, library, CAD panel (never closes the drawing), measure/info, then not-home → ask to close
 * the drawing (error screen → straight home), home + Android → exit, else nothing.
 */
export function decideBack(state: ShellBackState): BackAction {
  if (state.closeConfirmOpen) return "close-close-confirm";
  if (state.confirmOpen) return "close-confirm";
  if (state.exportOpen) return "close-export";
  if (state.markupTextOpen) return "close-markup-text";
  if (state.marking) return "end-markup";
  if (state.searchPanelOpen) return "close-search-panel";
  if (state.hasSearchResults) return "clear-search";
  if (state.libraryOpen) return "close-library";
  if (state.cadPanelOpen) return "close-cad-panel";
  if (state.selecting) return "end-selection";
  if (state.measuring || state.inspecting) return "end-measure";
  if (state.screen === "error") return "go-home";
  if (state.screen !== "home") return "ask-close-drawing";
  return state.nativeApp ? "exit-app" : "none";
}

/** A back handler; nested ones (overlays with their own levels) win over plain ones. */
export type BackHandler = () => void;

type Entry = { handler: BackHandler; nested: boolean; id: number };

/**
 * Back handler stack (T10 4.3-2): the newest nested handler runs first; without one the newest plain
 * handler runs; with none nothing happens. Unregistering brings the previous one back.
 */
export class BackStack {
  private entries: Entry[] = [];
  private nextId = 1;

  register(handler: BackHandler, nested = false): () => void {
    const entry: Entry = { handler, nested, id: this.nextId++ };
    this.entries.push(entry);
    return () => { this.entries = this.entries.filter((e) => e.id !== entry.id); };
  }

  /** Runs one handler; returns false when nobody handled it. */
  dispatch(): boolean {
    const pick = [...this.entries].reverse();
    const target = pick.find((e) => e.nested) ?? pick.find((e) => !e.nested);
    if (!target) return false;
    target.handler();
    return true;
  }

  get size(): number { return this.entries.length; }
}

/** The App-wide stack; LibraryScreen (group A) registers its nested handler here. */
export const backStack = new BackStack();

/** Register a back handler for as long as a screen is open; call the returned function to remove it. */
export function registerBackHandler(handler: BackHandler, options: { nested?: boolean } = {}): () => void {
  return backStack.register(handler, options.nested ?? false);
}
