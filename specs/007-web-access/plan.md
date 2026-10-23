# Implementation plan
1. Baseline source allowlist + one local backup; isolated npm dependencies.
2. Pure access controller + Firebase adapter + React gate. Test fail-closed and races before implementation.
3. Web-only dynamic entry, privacy notice + isolated analytics document, subpath-aware multi-entry build and scoped SW.
4. Production build and non-Web build; existing unit regression + access tests; headless mock UI and actual local rules emulator are separate evidence.
5. Synthetic DXF and real PNG/PDF export smoke. Runtime network paths + responsive bounds.
6. Corresponding-source provenance, no-private-data scanner, complete public SHA manifests, source CAS comparison and status matrix. No external writes.
