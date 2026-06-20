# Cloud deployment & golden images

Tooling to ship the q-ui panel as a cloud image or via unattended install,
with **per-instance credentials generated on first boot** (never `admin/admin`,
never a shared session secret). Everything here supports **amd64 and arm64**.

| Path | What it is | Use when |
| --- | --- | --- |
| [`cloud-init/`](cloud-init/) | Generic cloud-init user-data (unattended `install.sh`) | Any cloud, no image build |
| [`packer/`](packer/) | Packer build → AWS AMI + qcow2/raw | Reusable / Marketplace images |
| [`lightsail/`](lightsail/) | Launch script + snapshot builder | Amazon Lightsail |
| [`firstboot/`](firstboot/) | First-boot unit + script that mints per-instance creds | Used by the Packer/Lightsail images |
| [`marketplace/aws/`](marketplace/aws/) | AWS Marketplace submission checklist | Publishing an EC2 AMI |
| [`marketplace/hetzner/`](marketplace/hetzner/) | Hetzner Cloud notes | Hetzner deployments |
| [`test/`](test/) | Container smoke tests | Verifying the install/firstboot paths |

## Two models

- **Non-interactive install (cloud-init):** `install.sh` runs unattended when
  `QUI_NONINTERACTIVE=1` or stdin is not a TTY. Each instance installs and
  configures itself with random credentials. See [`cloud-init/README.md`](cloud-init/README.md).
- **Golden image (Packer):** the image contains the panel but **no DB and no
  secrets**; `firstboot` generates unique credentials on first boot. See
  [`packer/README.md`](packer/README.md).

## Unattended install knobs

`install.sh` reads these env vars in non-interactive mode (all optional; unset ⇒
secure random / default):

`QUI_USERNAME`, `QUI_PASSWORD`, `QUI_PANEL_PORT`, `QUI_WEB_BASE_PATH`,
`QUI_SSL_MODE` (`none`|`ip`|`domain`, default `none`), `QUI_DOMAIN`,
`QUI_ACME_EMAIL`, `QUI_ACME_HTTP_PORT` (ACME HTTP-01 listener port, default `80`),
`QUI_SSL_IPV6` (optional IPv6 address to add to an `ip`-mode cert),
`QUI_SERVER_IP` (fallback IP for the displayed access URL when auto-detection fails),
`QUI_DB_TYPE` (`sqlite`|`postgres`), `QUI_DB_DSN`.

The resulting credentials are written to `/etc/q-ui/install-result.env` (mode 600).
