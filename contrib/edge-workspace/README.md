# Edge workspace bridge (experimental)

This optional bridge renders existing Figma / Notion Edge tabs inside HAPI's right workspace panel. It sends JPEG tab frames and a small allowlisted set of pointer/keyboard commands. It does not read, copy or export browser Cookie databases. A browser-debugger banner is expected.

## Current acceptance boundary

Implemented: two panel tabs, per-site addresses, adjustable desktop width, mobile overlay, frame polling, navigation, pointer drag, wheel, key and text input, user-triggered one-use pairing, revocation and dedicated proxy support.

Validated: frontend unit tests and typecheck/build; backend authentication, namespace/machine restriction, replay, host and URL restrictions, revocation and proxy fail-closed tests; extension reuse/proxy/capture-origin tests with mocked browser APIs. Live public and local API authentication and Hong Kong egress are checked separately in the deployment. Actual Edge loading, session reuse and editing require a human browser test; they are not implied by passing mocked tests.

The view is approximately 1 JPEG frame per second, not a native WebContentsView or an official Figma iframe. Editing latency and complex Figma gestures need acceptance testing. No remote file picker, clipboard synchronization, multi-touch pinch or OAuth/security-challenge automation is provided. Complete those in the physical Edge browser. Keep the bridge extension page open.

## Install

1. Run `server.py` with Python 3 on the same computer as Edge. Set `HAPI_WORKSPACE_MACHINE_ID` to the local Runner machine UUID; the service refuses API access unless that machine is visible under the caller's HAPI JWT. `HAPI_WORKSPACE_HUB` defaults to `http://127.0.0.1:3007`.
2. The server listens only on `127.0.0.1:3011`. Route only `/api/workspace/` through your authenticated-origin HAPI gateway. Set upstream Host to `127.0.0.1:3011`, preserve Authorization and disable caching. Do **not** expose `/extension/` publicly.
3. Provide a dedicated Hong Kong-only proxy at loopback 7898. `HAPI_WORKSPACE_PROXY` may customize the service's health probe URL, but the extension PAC below must be updated consistently. No proxy credentials belong in this repository. The probe uses `https://api.country.is/`; stale/non-HK/error results stop input and frame delivery.
4. Existing model/system proxy is assumed to be loopback 7897. The extension PAC sends only listed Figma/Notion domains and known static domains via 7898, HAPI/private hosts direct and other browser traffic via 7897. If your existing system proxy/bypass rules differ, adapt and review the PAC first. Actual browser resource routes still need verification after connecting; HTTP redirects and new CDN domains can require an updated domain list. Non-system custom browser proxy/PAC or another controlling extension is rejected, not overwritten.
5. Edge → `edge://extensions` → Developer mode → Load unpacked → select this directory (manifest.json). This must be loaded in the **same Edge profile** that already has the desired logins.
6. In HAPI open **工作台 · Figma / Notion**, generate a one-use 10-minute pairing code, then paste it into the extension connection page. The browser must remain open on that computer. Nothing is automatically logged in.
7. Keep the extension connection page open. Closing it or disconnecting releases debugger attachments and restores the browser's underlying proxy setting. HAPI-side disconnect invalidates the bridge credential and purges frames immediately; the extension detects revocation on its next poll and restores the proxy.

The extension's debugger/proxy permissions are sensitive. Only pair with a HAPI instance whose authenticated users are authorized to view and edit these account tabs. Pairing extends that access to the HAPI workspace; do not publish a pairing code. Extension bridge credentials are in memory only and need pairing again after service/browser restart. No raw CDP server or arbitrary evaluation endpoint is exposed.

## Gateway snippet

Inside the existing server block (keep your original HTTPS, Origin and authentication controls):

```nginx
location ^~ /api/workspace/ {
    proxy_set_header Host 127.0.0.1:3011;
    proxy_set_header Authorization $http_authorization;
    proxy_pass http://127.0.0.1:3011;
}
```

The server validates HAPI JWTs against the Hub and requires local-machine visibility. Pairing never uses the CLI access token. Frames stay in memory; requests and credentials are not logged. The frame API only returns fresh frames for authenticated clients.

## Test

```sh
python3 contrib/edge-workspace/test_server.py
node --test contrib/edge-workspace/test_bridge.cjs
bun run --cwd web test src/components/WorkspacePanel.test.tsx
bun run --cwd web typecheck
```

Browser API references:

- https://developer.chrome.com/docs/extensions/reference/api/debugger
- https://developer.chrome.com/docs/extensions/reference/api/proxy
- https://chromedevtools.github.io/devtools-protocol/tot/Page/
- https://chromedevtools.github.io/devtools-protocol/tot/Input/
