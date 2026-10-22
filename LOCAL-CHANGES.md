# Local HAPI customization branch

Base: upstream `tiann/hapi`, tag `v0.30.7`, commit `0239edf38e2da653d662f31039e24ccea04c7837`.
Fork: https://github.com/soul667/hapi
Development branch: `axgu/local-workspace`. No upstream pull request has been opened.

Included source changes:

- Session multi-select, filtered select-all and confirmed batch deletion of inactive sessions; partial failures remain selected for retry.
- Cloud-photo frosted / clear themes and classic background, with light/dark appearance and browser-local preference.
- CodeBuddy / WorkBuddy-account CLI and ZCode entries in the creation panel. These require the optional local ACP integration endpoint below.
- Earlier local Claude model menu changes, lazy syntax language loading and smaller PWA precache. Model menu entries do not guarantee account entitlement.
- Planned Figma / Notion work panel: see [design and acceptance criteria](docs/plans/workspace-sidebar.md).

The live installation is separate from this checkout. No HAPI token, Aliyun credentials, browser profile, proxy subscription, TLS key, service environment or user conversation database is included.

## ACP deployment boundary

The frontend calls `POST /api/integrations/spawn` using its normal HAPI JWT.
Upstream does not implement this endpoint. The current local deployment provides a loopback authenticated launcher and routes the endpoint through nginx. The backend adapter has not yet been converted into a portable upstream feature; a fresh stock install must not claim these two entries work automatically.

To upstream this feature, move agent discovery and launch into the Runner / Hub protocol, remove machine-specific assumptions, include ACP adapter dependency provenance, and test permissions, workspace roots, native session resume, cancellation and multiple machines. WorkBuddy desktop chat import is not implemented.

## Verification carried over from live source

- Creation panel: 42 relevant tests, typecheck, production build; both agent launch APIs and ZCode creation through the UI verified.
- Bulk delete: 97 relevant tests, typecheck, production build; UI selection and confirmation checked without deleting user conversations.
- Cloud themes: 13 settings tests, typecheck, production build; light/dark browser rendering inspected.

These are package-level checks on the corresponding live source files. No full repository, native client or upstream-main compatibility test is claimed.
