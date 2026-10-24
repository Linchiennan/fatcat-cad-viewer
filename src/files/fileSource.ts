// Display-only provenance: never requests permissions or fetches source URLs.
export type FileSource = {kind: 'path' | 'library' | 'import'; path: string};
const sources = new WeakMap<File, string>();
export function safeSourcePath(value: string): string {
  const path = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!path || /(?:^|[\\/])fakepath(?:[\\/]|$)/i.test(path) || /^(blob|data):/i.test(path)) return '';
  if (/^[a-z][\w+.-]*:\/\//i.test(path)) {
    try { const u = new URL(path); u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.toString(); } catch { return ''; }
  }
  return path.split(/[?#]/, 1)[0];
}
export function rememberFileSource(file: File, path: string): void { sources.set(file, safeSourcePath(path)); }
export function fileSource(file: File): FileSource {
  const path = sources.get(file) || safeSourcePath(file.webkitRelativePath || '');
  return {kind: path ? 'path' : 'import', path};
}
export async function resolveFileSource(file: File, entryId?: string): Promise<FileSource> {
  const known = fileSource(file);
  if (known.kind === 'path') return known;
  // A reopened library File is a stored snapshot; report its real library location.
  if (entryId) {
    try {
      const {listLibraryDrawings, libraryBreadcrumb} = await import('../library/drawingLibrary');
      const entry = (await listLibraryDrawings()).find(e => e.id === entryId);
      if (entry) {
        const folders = await libraryBreadcrumb(entry.parentId);
        return {kind:'library', path:[...folders.map(f => f.name), entry.name].join(' / ')};
      }
    } catch { /* A metadata read failure must not prevent viewing the drawing. */ }
  }
  return fileSource(file);
}
