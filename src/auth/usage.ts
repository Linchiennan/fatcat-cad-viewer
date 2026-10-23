// This document has no drawing DOM, account data, query string, or user-provided links.
// The only message accepted is a fixed literal from the same-origin parent.
import { initializeApp } from 'firebase/app';
import { initializeAnalytics, isSupported, logEvent, setAnalyticsCollectionEnabled, setConsent } from 'firebase/analytics';
import config from '../firebase-web-config.json';
let enabled = false;
window.addEventListener('message', async event => {
  if (enabled || event.source !== window.parent || window.parent === window || event.origin !== location.origin || event.data !== 'fatcat-usage-enable') return;
  enabled = true;
  try {
    if (!await isSupported()) return;
    setConsent({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    const analytics = initializeAnalytics(initializeApp(config, 'fatcat-web-usage'), { config: {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: new URL(import.meta.env.BASE_URL, location.origin).href,
      page_referrer: '', page_title: 'FatCat CAD web preview',
    } });
    logEvent(analytics, 'app_access', { app_variant: 'web_preview' });
    window.addEventListener('pagehide', () => setAnalyticsCollectionEnabled(analytics, false), { once: true });
  } catch { /* Analytics never determines access or blocks CAD. No diagnostic upload. */ }
});
