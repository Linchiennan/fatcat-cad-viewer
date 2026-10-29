import type { ReactNode } from 'react';
import { useI18n } from '../i18n/translations';
import { leaveGuest } from './guestMode';
import './auth.css';

/** The guest's page: the same top bar as a signed-in visit, saying what a guest can do, with the way back to sign-in. */
export function GuestShell({ children }: { children: ReactNode }) {
  const { locale } = useI18n(); const en = locale === 'en';
  return <div className="web-access is-guest">
    <header className="web-account"><span className="access-summary"><span>{en ? 'Guest preview' : '訪客試用中'}</span><small role="status">{en ? 'Demo drawings only · marks and exports are cleared when you close the page' : '只能開示範圖，關閉後註記不保留'}</small></span>
      <button title={en ? 'Back to Google sign-in. Guest marks and exports are cleared.' : '回到 Google 登入畫面；訪客的註記與輸出會清空。'} onClick={leaveGuest}>{en ? 'Sign in' : '登入'}</button></header>
    <div className="web-cad">{children}</div>
  </div>;
}
