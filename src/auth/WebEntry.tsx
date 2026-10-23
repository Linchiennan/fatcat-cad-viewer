import { lazy, Suspense } from 'react';
import { AuthGate } from './AuthGate';
import { AccessController } from './accessController';
import { createFirebaseBackend } from './firebaseBackend';
const controller = new AccessController(createFirebaseBackend());
const CadApp = lazy(() => import('../app/App').then(m => ({ default: m.App })));
export default function WebEntry() { return <AuthGate controller={controller}><Suspense fallback={<p role="status">正在載入 / Loading…</p>}><CadApp /></Suspense></AuthGate>; }
