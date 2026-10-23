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
  if (code === 'offline-expired') return en ? 'Your 14-day offline access has expired. Connect to the internet and verify again. Your local library is preserved.' : '14 天離線授權已到期，請連網重新驗證。本機圖庫不會被刪除。';
  if (code === 'clock-rollback' || code === 'invalid-offline-grant') return en ? 'The device time or local grant could not be validated. Correct the clock and verify online.' : '裝置時間回撥或本機授權資料無法確認，請校正時間並連網重新驗證。';
  if (code === 'logout-failed') return en ? 'Access is locked. Sign-out could not be confirmed; close this tab on a shared device.' : '入口已鎖定，但無法確認登出；共用裝置請關閉此分頁。';
  return en ? 'An online server check is required. Reconnect and retry. Your local library is not deleted.' : '需要連線向伺服器確認權限，請恢復網路後重試。本機圖庫不會被刪除。';
}
export function AuthGate({ controller, children }: { controller: AccessController; children: ReactNode }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const { locale } = useI18n(); const en = locale === 'en';
  const [busy, setBusy] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [resourcesReady, setResourcesReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    let disposed = false;
    const requestStatus = () => navigator.serviceWorker?.controller?.postMessage({ type: 'fatcat-cache-status' });
    const update = (event: MessageEvent) => {
      if (event.data?.type === 'fatcat-cache-status') setResourcesReady(event.data.ready === true);
      if (event.data?.type === 'fatcat-worker-ready' && event.data.build !== BUILD_ID) {
        setUpdateRequired(true);
      }
      if (event.data?.type === 'fatcat-worker-ready') requestStatus();
    };
    navigator.serviceWorker?.addEventListener('message', update);
    navigator.serviceWorker?.addEventListener('controllerchange', requestStatus);
    void navigator.serviceWorker?.ready.then(() => { if (!disposed) requestStatus(); });
    window.addEventListener('pageshow', requestStatus);
    document.addEventListener('visibilitychange', requestStatus);
    const timer = setInterval(requestStatus, 60000); requestStatus();
    return () => { disposed = true; clearInterval(timer); navigator.serviceWorker?.removeEventListener('message', update); navigator.serviceWorker?.removeEventListener('controllerchange', requestStatus); window.removeEventListener('pageshow', requestStatus); document.removeEventListener('visibilitychange', requestStatus); };
  }, [controller]);
  useEffect(() => {
    controller.start();
    const verify = () => { controller.checkLocal(); if (navigator.onLine) void controller.recheck(); };
    const visible = () => { if (document.visibilityState === 'visible') verify(); else controller.checkLocal(); };
    const online = () => { setOnline(navigator.onLine); verify(); };
    const offline = () => { setOnline(false); controller.checkLocal(); };
    const storage = (event: StorageEvent) => { if (event.key === 'fatcat.offline-access.v1' || event.key === null) controller.checkLocal('offline', false); };
    window.addEventListener('storage', storage);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') verify(); }, 60000);
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', online); window.addEventListener('offline', offline);
    window.addEventListener('pageshow', online);
    return () => { clearInterval(timer); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('pageshow', online); controller.stop(); };
  }, [controller]);
  const allowed = state.status === 'allowed';
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
    {allowed && <header className="web-account"><span className="access-summary"><span>{state.expiresAt ? `${en ? 'Offline access until' : '離線授權有效至'} ${new Date(state.expiresAt).toLocaleString(en ? 'en-US' : 'zh-TW')}` : (en ? 'Online only: local grant unavailable' : '僅限連線：無法儲存本機授權')}</span><small role="status">{resourcesReady ? (en ? 'Website resources ready (valid local grant required)' : '網站資源已備妥（仍須有效授權）') : (en ? 'Offline resources not ready; stay online before closing' : '離線資源尚未備妥，關閉前請保持連線')}{!online && (en ? ' · Offline' : ' · 目前離線')}</small></span>{updateRequired && <button title={en ? 'Unsaved work will close; the library and valid grant remain.' : '未保存操作將關閉；圖庫與未到期授權保留。'} onClick={() => { if (window.confirm(en ? 'Reload the new version? Unsaved work will close.' : '重新載入新版？未保存的操作將關閉。')) location.reload(); }}>{en ? 'Update' : '新版'}</button>}<button onClick={() => void controller.logout()}>{en ? 'Sign out' : '登出'}</button></header>}
    {state.mountedUid && <div className={`web-cad${allowed ? '' : ' is-locked'}`} key={`cad:${state.mountedUid}`} aria-hidden={!allowed} inert={!allowed}>{children}</div>}
    {!allowed && <main className="auth-screen" onKeyDown={event => event.stopPropagation()}><section className="auth-card" aria-label={en ? 'Account access' : '帳號存取'}>
      <LangSwitch /><h1>大肥貓 CAD</h1><h2>{en ? 'Friends web preview' : '朋友網頁測試版'}</h2>
      <p>{en ? 'Free tools, including PNG and PDF export. Sign in with an approved Google account.' : '所有功能免費，包含 PNG／PDF 輸出。請使用白名單 Google 帳號登入。'}</p>
      <p role="status">{checking ? (en ? 'Checking access online…' : '正在連線確認權限…') : state.reason ? errorMessage(state.reason, en) : (en ? 'Google sign-in is required.' : '請先以 Google 登入。')}</p>
      {(state.status === 'signed-out' || state.status === 'denied') && <button className="primary-btn" disabled={busy} onClick={async () => { setBusy(true); try { await controller.login(); } finally { setBusy(false); } }}>{en ? 'Sign in with Google' : '使用 Google 登入'}</button>}
      {updateRequired && <><p role="alert">{en ? 'A new version is ready. Reload when convenient; the library and unexpired local grant remain, but unsaved work will close.' : '新版已就緒，可自行重新載入。圖庫與未到期本機授權保留，但未保存操作將關閉。'}</p><button className="primary-btn" onClick={() => location.reload()}>{en ? 'Reload latest version' : '重新載入新版'}</button></>}
      {state.status === 'locked' && <button className="primary-btn" onClick={() => void controller.recheck()}>{en ? 'Retry online check' : '重新連線驗證'}</button>}
      {(state.status === 'locked' || checking) && <button className="secondary-btn" onClick={() => void controller.logout()}>{en ? 'Sign out / switch account' : '登出／切換帳號'}</button>}
      <p className="auth-note">{en ? 'Successful Google and server verification grants 14 days of local offline access, including reopening once website resources are ready. Offline use never extends the deadline. Expiration requires online verification. Sign-out, account switching or confirmed revocation clears the grant, not the device library.' : '成功 Google 與伺服器驗證後，取得 14 天本機離線授權；網站資源備妥後，關閉重開也可離線使用。離線使用不延長期限，到期須連網重新驗證。登出、切帳號或確認撤權會清除授權，不刪本機圖庫。'}</p>
      <a href="./WEB_PRIVACY.md" target="_blank" rel="noopener noreferrer">{en ? 'Web privacy notice' : '網頁版隱私告知'}</a>
    </section></main>}
    {allowed && online && <iframe key={`usage:${state.mountedUid}`} className="usage-frame" title="Usage statistics" src="./usage.html" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" onLoad={e => e.currentTarget.contentWindow?.postMessage('fatcat-usage-enable', window.location.origin)} />}
  </div>;
}
