# Implementation plan

> 歷史紀錄：本文件 server-only／斷網鎖定／重開需在線的舊契約與驗收，已由 `../008-offline-access/spec.md` 的 14 天本機離線授權取代；其餘登入、隱私、公開來源與功能保留要求仍有效。新版結果見 008 acceptance，不把舊測試數當本次結果。
1. Baseline source allowlist + one local backup; isolated npm dependencies.
2. Pure access controller + Firebase adapter + React gate. Test fail-closed and races before implementation.
3. Web-only dynamic entry, privacy notice + isolated analytics document, subpath-aware multi-entry build and scoped SW.
4. Production build and non-Web build; existing unit regression + access tests; headless mock UI and actual local rules emulator are separate evidence.
5. Synthetic DXF and real PNG/PDF export smoke. Runtime network paths + responsive bounds.
6. Corresponding-source provenance, no-private-data scanner, complete public SHA manifests, source CAS comparison and status matrix. No external writes.
