import { lazy, Suspense } from 'react';
import { AuthGate } from './AuthGate';
import { GuestShell } from './GuestShell';
import { AccessController } from './accessController';
import { createFirebaseBackend } from './firebaseBackend';
import { IS_GUEST, enterGuest } from './guestMode';
// A guest never starts Google sign-in, the allowlist check or usage statistics (用戶 2026-10-29：訪客不算統計).
const controller = IS_GUEST ? null : new AccessController(createFirebaseBackend());
const CadApp = lazy(() => import('../app/App').then(m => ({ default: m.App })));
const app = <Suspense fallback={<p role="status">正在載入 / Loading…</p>}><CadApp /></Suspense>;
export default function WebEntry() { return controller ? <AuthGate controller={controller} onGuest={enterGuest}>{app}</AuthGate> : <GuestShell>{app}</GuestShell>; }
