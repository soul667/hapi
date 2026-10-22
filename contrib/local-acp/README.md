# Local ACP deployment reference

These are the currently deployed Linux integration scripts for the CodeBuddy / WorkBuddy-account CLI and ZCode bridges. This is a reference for the existing local installation, **not** an upstream portable install. Paths, local machine validation, allowed workspace roots, loopback ports and installed wrapper commands must be adapted before another deployment. No credential values or session-state files are included.

- `hapi_acp.py`: launch/resume mapping between HAPI IDs and native ACP IDs. Model choices come from the native ACP `configOptions`; requested account-supported models are applied with `session/set_config_option` before completing native load/new. No user/model prompt is sent to select a model.
- `model_panel.py`: selects a model for an idle ZCode session or a native permission mode for an idle CodeBuddy session by stopping only its managed `hapi-panel-*` / `hapi-zcode-*` / `hapi-codebuddy-*` service and restoring the same HAPI/native session IDs. Busy, pending-confirmation, known-background-task and unmanaged sessions are rejected. A model is reported selected only after the native agent confirms it.
- `panel_server.py`: JWT-authenticated local API at loopback 3010 for launching, bridge identity/catalog and model operations. Session access is checked with the Hub before reading private mappings or modifying a session.

Gateway routes `/api/integrations/spawn`, `/api/integrations/catalog` and `/api/integrations/session/` must reach this server behind the existing HTTPS and Origin policy. The regular Hub does not implement these optional routes. CLI tokens, private mapping files and provider credentials stay outside Git.

The local ZCode account probe currently offers `GLM-5.3` and `GLM-5.3-Flash`. That account catalog is private runtime state, not a globally guaranteed model list. New agent/account versions should refresh the catalog from ACP.

Brand icons: CodeBuddy uses the existing `@lobehub/icons` CodeBuddy component; ZCode uses the app icon from the installed official ZCode package. These logos identify the underlying applications; they are not HAPI branding.

Validation: native idle switch from GLM-5.3 to GLM-5.3-Flash kept both session IDs and received native model confirmation. Real user sessions were not restarted by that probe. Frontend model-control, brand, header, row and creation tests passed (65 tests).

## CodeBuddy Full Access

CodeBuddy native ACP advertises `fullAccess` (Full Access). The bridge explicitly applies it using `session/set_mode` after native new/load, and records the native acknowledgement. HAPI exposes the available native modes in the existing-session header. The previous launcher hard-coded `--permission-mode default`; it now bootstraps with `bypassPermissions`, then selects the requested ACP mode (new sessions default to `fullAccess`). No synthetic sandbox environment is set and no account-global settings file is changed. Choosing another mode in HAPI persists that selection for subsequent resume.

The live idle CodeBuddy conversation was upgraded with the same native session ID and confirmed `fullAccess`; a task was not interrupted.

## ZCode YOLO

The ZCode ACP bridge applies the account-provided `mode` config option with `session/set_config_option`. New sessions default to native `yolo`; the existing-session header exposes both model and permission selectors. `build` requests confirmations and `guarded` is not equivalent to YOLO. Idle persisted sessions can be restored under YOLO while retaining their native session IDs; currently running sessions are not interrupted automatically. Native permission changes are recorded only after an ACP acknowledgement.

A persisted idle ZCode conversation was restored with the same native session ID and confirmed `yolo`. An empty disposable model-catalog probe could not be resumed because ZCode had not retained its backend session; it was left inactive rather than silently replacing its native context.
