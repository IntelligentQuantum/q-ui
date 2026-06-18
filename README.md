[English](/README.md) | [فارسی](/README.fa_IR.md)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./media/q-ui-dark.svg">
    <img alt="Q-UI" src="./media/q-ui-light.svg" width="300">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/IntelligentQuantum/q-ui/releases"><img src="https://img.shields.io/github/v/release/IntelligentQuantum/q-ui" alt="Release"></a>
  <a href="https://github.com/IntelligentQuantum/q-ui/actions"><img src="https://img.shields.io/github/actions/workflow/status/IntelligentQuantum/q-ui/release.yml.svg" alt="Build"></a>
  <a href="#"><img src="https://img.shields.io/github/go-mod/go-version/IntelligentQuantum/q-ui.svg" alt="GO Version"></a>
  <a href="https://github.com/IntelligentQuantum/q-ui/releases/latest"><img src="https://img.shields.io/github/downloads/IntelligentQuantum/q-ui/total.svg" alt="Downloads"></a>
  <a href="https://www.gnu.org/licenses/gpl-3.0.en.html"><img src="https://img.shields.io/badge/license-GPL%20V3-blue.svg?longCache=true" alt="License"></a>
</p>

**Q-UI** is an advanced, open-source web control panel for managing [Xray-core](https://github.com/XTLS/Xray-core) servers — and a full **multi-tenant reseller platform** built on top. It provides a clean, modern, multi-language interface for deploying, configuring, and monitoring a wide range of proxy and VPN protocols, from a single VPS to multi-node deployments, while letting you run isolated reseller **workspaces** with their own storefronts, branding, payments, and customers.

Q-UI is a fork of [**3x-ui** by MHSanaei](https://github.com/MHSanaei/3x-ui) (which itself builds on the work of [alireza0](https://github.com/alireza0/) and the original [x-ui](https://github.com/vaxilu/x-ui)). On top of the upstream Xray panel, Q-UI adds a rebuilt React frontend, a 4-role permission system, a wallet/commerce stack, and a complete **Manager multi-tenancy** system. See [What this fork adds](#-what-this-fork-adds) for the full list.

> [!IMPORTANT]
> This project is intended for personal use only. Please do not use it for illegal purposes or in a production environment.

## ✨ What this fork adds

Everything below is on top of upstream 3x-ui:

### 🏢 Manager multi-tenancy & workspaces
- **Manager role + isolated workspaces.** A 5th role, `manager`, owns a self-contained workspace served at `/panel/manager/<slug>` — its own storefront, products, branding, customers, payments, finance, and support. `tenant_id = 0` is the original admin panel; the feature is fully additive.
- **Per-workspace accounts & login.** The same username can exist independently in each workspace; login is **workspace-scoped** — you sign in on the workspace's own URL/domain, and a non-member is shown that workspace's own login/register page.
- **Per-workspace wallets.** Every account's balance is isolated to its workspace. A store purchase debits **both** the customer and the workspace's prepaid pool (the manager's balance), so a sale needs funds on both sides. Admins can top up any workspace's balance from the Managers page.
- **Custom domains.** Admins assign a domain to a workspace (e.g. `panel.example.com`); visiting it renders that workspace's storefront and branding directly (Host → tenant resolution; you wire your own nginx/reverse proxy).
- **Strict isolation.** Payments, finance, orders, deposits, bank cards, tickets & categories, and referrals are all scoped per workspace — the admin panel sees only its own, and each manager sees only theirs.
- **Admin oversight.** The admin Managers control plane creates/suspends workspaces, allocates bandwidth quotas, sets domains, rotates API keys, tops up balances, and can view-as / impersonate any workspace.

### 💳 Commerce, wallet & payments
- **Wallet & ledger.** Per-user credit balance with an atomic, auditable transaction log; admins/managers add/remove/set balances.
- **Product catalog & storefront.** Sellable plans (traffic, duration, price, target inbounds, audience); buying provisions a real Xray config for the buyer.
- **Orders & services.** Every purchase/renewal is recorded; members view their configs (QR + share links), regenerate secrets, and renew or change plan.
- **Payment gateways (per workspace).** ZarinPal and Plisio (crypto) configured per workspace — no fallback to the admin's credentials.
- **Manual (card-to-card) deposits.** Bank-card management + receipt upload and an admin/manager review queue, isolated per workspace.
- **Finance dashboards.** Revenue, time series, payment breakdown, segments, top products/customers/resellers/depositors, and CSV exports.
- **Referrals.** Per-workspace reseller referral codes, links, stats, and commission attribution.
- **Support / ticketing.** Helpdesk with per-workspace ticket categories and staff assignment.

### 🖥️ Platform
- **Modern React SPA frontend** (React 19 + Vite + Tailwind v4) replacing the legacy UI — fully responsive, **RTL/LTR** aware, with light / dark / ultra themes and a Persian (Jalali) calendar for Persian users.
- **4-role RBAC** — Admin, Manager, Reseller, Member — with a backend-enforced permission matrix, ownership scoping (no IDOR), and a role-aware dynamic sidebar and route guards.
- **PostgreSQL support** alongside SQLite, with a built-in migration path.

## Features

Core Xray-panel capabilities inherited from upstream and maintained here:

- **Multi-protocol inbounds** — VLESS, VMess, Trojan, Shadowsocks, WireGuard, Hysteria2, HTTP, SOCKS (Mixed), Dokodemo-door / Tunnel, and TUN.
- **Modern transports & security** — TCP (Raw), mKCP, WebSocket, gRPC, HTTPUpgrade, and XHTTP, secured with TLS, XTLS, and REALITY.
- **Fallbacks** — serve multiple protocols on a single port (e.g. VLESS and Trojan on 443) using Xray's fallback support.
- **Per-client management** — traffic quotas, expiry dates, IP limits, live online status, one-click share links, QR codes, and subscriptions.
- **Traffic statistics** — per inbound, per client, and per outbound, with reset controls.
- **Multi-node support** — manage and scale across multiple servers from a single panel.
- **Outbound & routing** — WARP, NordVPN, custom routing rules, load balancers, and outbound proxy chaining.
- **Built-in subscription server** with multiple output formats.
- **Telegram bot** for remote monitoring and management.
- **RESTful API** with in-panel Swagger documentation.
- **Flexible storage** — SQLite (default) or PostgreSQL.
- **English & Persian UI** with dark and light themes.
- **Fail2ban integration** for enforcing per-client IP limits.

## Screenshots

| Overview | Manager workspaces |
| :---: | :---: |
| ![Overview](./media/overview.png) | ![Managers](./media/managers.png) |
| **Finance** | **Products &amp; store** |
| ![Finance](./media/finance.png) | ![Products](./media/products.png) |
| **Users** | &nbsp; |
| ![Users](./media/users.png) | &nbsp; |

## Quick Start

```bash
bash <(curl -Ls https://raw.githubusercontent.com/IntelligentQuantum/q-ui/main/install.sh)
```

During installation a random username, password, and access path are generated. After installation, run `q-ui` to open the management menu, where you can start/stop the service, view or reset your login credentials, manage SSL certificates, and more.

For full documentation, please visit the [project Wiki](https://github.com/IntelligentQuantum/q-ui/wiki).

## Supported Platforms

**Operating systems:** Ubuntu, Debian, Armbian, Fedora, CentOS, RHEL, AlmaLinux, Rocky Linux, Oracle Linux, Amazon Linux, Virtuozzo, Arch, Manjaro, Parch, openSUSE (Tumbleweed / Leap), Alpine, and Windows.

**Architectures:** `amd64` · `386` · `arm64` (aarch64) · `armv7` · `armv6` · `armv5` · `s390x`.

## Database Options

Q-UI supports two backends, chosen during the install:

- **SQLite** (default) — a single file at `/etc/q-ui/q-ui.db`. Zero setup, ideal for small and medium deployments.
- **PostgreSQL** — recommended for high client counts, multi-node, or multi-workspace setups. The installer can install PostgreSQL locally for you, or accept a DSN to an existing server.

At runtime the backend is selected via environment variables (the installer writes these to `/etc/default/q-ui` for you):

```
QUI_DB_TYPE=postgres
QUI_DB_DSN=postgres://xui:password@127.0.0.1:5432/xui?sslmode=disable
```

### Migrating an existing SQLite install to PostgreSQL

```bash
q-ui migrate-db --dsn "postgres://xui:password@127.0.0.1:5432/xui?sslmode=disable"
# then set QUI_DB_TYPE and QUI_DB_DSN in /etc/default/q-ui and restart:
systemctl restart q-ui
```

The source SQLite file is left untouched; remove it manually once you have verified the new backend.

### Docker

The default `docker compose up -d` keeps using SQLite. To run with the bundled PostgreSQL service, uncomment the two `QUI_DB_*` env lines in `docker-compose.yml` and start with the profile:

```bash
docker compose --profile postgres up -d
```

The image bundles Fail2ban (enabled by default) to enforce per-client **IP limits**. Fail2ban bans offenders with `iptables`, which requires the `NET_ADMIN` capability. `docker-compose.yml` already grants it via `cap_add`; if you start the container with `docker run` instead, add the capabilities yourself, otherwise bans are logged but never applied:

```bash
docker run -d --cap-add=NET_ADMIN --cap-add=NET_RAW ... ghcr.io/IntelligentQuantum/q-ui
```

## Custom Domains for Workspaces

A manager workspace is reachable at `/panel/manager/<slug>` out of the box. To give a workspace its own domain (e.g. `panel.example.com`):

1. As **admin**, open **Managers**, edit the workspace, and set its **Custom domain**.
2. Point that domain's DNS at your server and configure your reverse proxy (nginx/Caddy) to forward it to Q-UI, **preserving the `Host` header**.

Q-UI resolves the incoming `Host` to the workspace and serves its storefront and branding directly — no slug needed in the URL.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `QUI_DB_TYPE` | Database backend: `sqlite` or `postgres` | `sqlite` |
| `QUI_DB_DSN` | PostgreSQL connection string (when `QUI_DB_TYPE=postgres`) | — |
| `QUI_DB_FOLDER` | Directory for the SQLite database file | `/etc/q-ui` |
| `QUI_DB_MAX_OPEN_CONNS` | Maximum open connections (PostgreSQL pool) | — |
| `QUI_DB_MAX_IDLE_CONNS` | Maximum idle connections (PostgreSQL pool) | — |
| `QUI_ENABLE_FAIL2BAN` | Enable Fail2ban-based IP-limit enforcement | `true` |
| `QUI_LOG_LEVEL` | Log verbosity (`debug`, `info`, `warning`, `error`) | `info` |
| `QUI_DEBUG` | Enable debug mode | `false` |

## Supported Languages

The panel UI is available in 2 languages, with full RTL support:

English · فارسی

## Contributing

Contributions are welcome. Please read the [Contributing Guide](/CONTRIBUTING.md) before opening an issue or pull request.

## Credits & Acknowledgments

Q-UI stands on the shoulders of the projects it forks from — please support and star them:

- [**3x-ui** by MHSanaei](https://github.com/MHSanaei/3x-ui) — the upstream Xray panel this project is forked from.
- [alireza0/x-ui](https://github.com/alireza0/) — earlier work that 3x-ui builds on.
- [XTLS/Xray-core](https://github.com/XTLS/Xray-core) — the proxy core that powers everything here.

Routing-rules data:

- [Iran v2ray rules](https://github.com/chocolate4u/Iran-v2ray-rules) (License: **GPL-3.0**) — enhanced v2ray/xray routing rules with built-in Iranian domains and a focus on security and adblocking.
- [Russia v2ray rules](https://github.com/runetfreedom/russia-v2ray-rules-dat) (License: **GPL-3.0**) — automatically updated V2Ray routing rules for blocked domains/addresses in Russia.

## License

Q-UI is released under the **GPL-3.0** license, the same as upstream 3x-ui. See [LICENSE](/LICENSE).

## Stargazers over Time

[![Stargazers over time](https://starchart.cc/IntelligentQuantum/q-ui.svg?variant=adaptive)](https://starchart.cc/IntelligentQuantum/q-ui)
