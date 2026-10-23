import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n } from '../i18n/translations';
import { LangSwitch } from '../app/LangSwitch';
import { AccessController } from './accessController';
import { BUILD_ID } from '../app/buildIdentity';
import './auth.css';

function errorMessage(code: string, en: boolean) {
  if (['not-allowed', 'permission-denied', 'invalid-identity', 'unauthenticated', 'auth/user-disabled', 'auth/user-token-expired'].includes(code)) return en ? 'This verified Google account is not enabled on the allowlist. Ask the site owner.' : '此已驗證 Google 帳號未獲白名單授權，請聯絡網站管理者。';
  if (code === 'auth/popup-blocked') return en ? 'Allow pop-ups, then press Google sign-in again.' : '請允許彈出視窗，再按 Google 登入。';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return en ? 'Sign-in cancelled. You can try again.' : '已取消登入，可重新嘗試。';
  if (code === 'auth/unauthorized-domain') return en ? 'This site domain is not authorized in Firebase. Contact the owner.' : '此網域尚未獲 Firebase 授權，請聯絡管理者。';
  if (code === 'logout-failed') return en ? 'Access is locked. Sign-out could not be confirmed; close this tab on a shared device.' : '入口已鎖定，但無法確認登出；共用裝置請關閉此分頁。';
  return en ? 'An online server check is required. Reconnect and retry. Your local library is not deleted.' : '需要連線向伺服器確認權限，請恢復網路後重試。本機圖庫不會被刪除。';
}
export function AuthGate({ controller, children }: { controller: AccessController; children: ReactNode }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const { locale } = useI18n(); const en = locale === 'en';
  const [busy, setBusy] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  useEffect(() => {
    const update = (event: MessageEvent) => {
      if (event.data?.type === 'fatcat-worker-ready' && event.data.build !== BUILD_ID) {
        setUpdateRequired(true); controller.lock('update-required');
      }
    };
    navigator.serviceWorker?.addEventListener('message', update);
    return () => navigator.serviceWorker?.removeEventListener('message', update);
  }, [controller]);
  useEffect(() => {
    controller.start();
    const visible = () => { if (document.visibilityState === 'visible') void controller.recheck(); else controller.lock('background'); };
    const online = () => { void controller.recheck(); };
    const offline = () => controller.lock('offline');
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void controller.recheck(); }, 60000);
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', online); window.addEventListener('offline', offline);
    window.addEventListener('pageshow', online);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('pageshow', online); controller.stop(); };
  }, [controller]);
  const allowed = state.status === 'allowed' && !updateRequired;
  useEffect(() => {
    if (allowed) return;
    const stopCadShortcuts = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.auth-screen')) {
        event.stopImmediatePropagation();
        if (event.key === 'Escape') event.preventDefault();
      }
    };
    window.addEventListener('keydown', stopCadShortcuts, true);
    return () => window.removeEventListener('keydown', stopCadShortcuts, true);
  }, [allowed]);
  const checking = state.status === 'checking';
  return <div className="web-access">
    {allowed && <header className="web-account"><span>{en ? 'Online access verified' : '已連線驗證授權'}</span><button onClick={() => void controller.logout()}>{en ? 'Sign out' : '登出'}</button></header>}
    {state.mountedUid && <div className={`web-cad${allowed ? '' : ' is-locked'}`} key={`cad:${state.mountedUid}`} aria-hidden={!allowed} inert={!allowed}>{children}</div>}
    {!allowed && <main className="auth-screen" onKeyDown={event => event.stopPropagation()}><section className="auth-card" aria-label={en ? 'Account access' : '帳號存取'}>
      <LangSwitch /><h1>大肥貓 CAD</h1><h2>{en ? 'Friends web preview' : '朋友網頁測試版'}</h2>
      <p>{en ? 'Free tools, including PNG and PDF export. Sign in with an approved Google account.' : '所有功能免費，包含 PNG／PDF 輸出。請使用白名單 Google 帳號登入。'}</p>
      <p role="status">{checking ? (en ? 'Checking access online…' : '正在連線確認權限…') : state.reason ? errorMessage(state.reason, en) : (en ? 'Google sign-in is required.' : '請先以 Google 登入。')}</p>
      {(state.status === 'signed-out' || state.status === 'denied') && <button className="primary-btn" disabled={busy} onClick={async () => { setBusy(true); try { await controller.login(); } finally { setBusy(false); } }}>{en ? 'Sign in with Google' : '使用 Google 登入'}</button>}
      {updateRequired && <><p role="alert">{en ? 'A new version is ready. Reload to verify access again; the device library is preserved, but unsaved work will close.' : '新版已就緒，需重新載入並驗證權限。裝置圖庫保留，但未保存操作將關閉。'}</p><button className="primary-btn" onClick={() => location.reload()}>{en ? 'Reload latest version' : '重新載入新版'}</button></>}
      {!updateRequired && state.status === 'locked' && <button className="primary-btn" onClick={() => void controller.recheck()}>{en ? 'Retry online check' : '重新連線驗證'}</button>}
      {(state.status === 'locked' || checking) && <button className="secondary-btn" onClick={() => void controller.logout()}>{en ? 'Sign out / switch account' : '登出／切換帳號'}</button>}
      <p className="auth-note">{en ? 'Online verification is required every time you open or return to this page. If disconnected, an open drawing stays in memory but is locked until verified again. Signing out closes it; the device library remains.' : '每次開啟或回到網頁都需在線驗證。斷網時已開圖暫留記憶體、暫停操作，重新驗證後繼續；登出會關圖，但保留裝置圖庫。'}</p>
      <a href="./WEB_PRIVACY.md" target="_blank" rel="noopener noreferrer">{en ? 'Web privacy notice' : '網頁版隱私告知'}</a>
    </section></main>}
    {allowed && <iframe key={`usage:${state.mountedUid}`} className="usage-frame" title="Usage statistics" src="./usage.html" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" onLoad={e => e.currentTarget.contentWindow?.postMessage('fatcat-usage-enable', window.location.origin)} />}
  </div>;
}
