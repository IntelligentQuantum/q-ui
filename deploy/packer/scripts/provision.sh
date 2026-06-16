#!/usr/bin/env bash
#
# provision.sh — install the 3x-ui panel into a golden image (Packer).
#
# Self-contained: mirrors install.sh's download/extract logic but DELIBERATELY
# does NOT run config_after_install and does NOT create a database. The image
# must ship without /etc/q-ui/q-ui.db so that deploy/firstboot generates unique
# per-instance credentials on first boot. Both q-ui.service and
# q-ui-firstboot.service are enabled but NOT started here.
#
# Inputs (from Packer environment_vars):
#   QUI_VERSION  release tag (e.g. v3.3.1) or 'latest'
#   QUI_ARCH     amd64 (default) or arm64
set -euo pipefail

QUI_VERSION="${QUI_VERSION:-latest}"
QUI_ARCH="${QUI_ARCH:-amd64}"
QUI_DIR="/usr/local/q-ui"
REPO="IntelligentQuantum/q-ui"
export DEBIAN_FRONTEND=noninteractive

echo "[provision] installing base packages..."
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates curl tar tzdata socat openssl cron jq

echo "[provision] resolving 3x-ui version..."
if [ "$QUI_VERSION" = "latest" ]; then
    QUI_VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | jq -r '.tag_name')
fi
if [ -z "$QUI_VERSION" ] || [ "$QUI_VERSION" = "null" ]; then
    echo "[provision] ERROR: could not resolve 3x-ui release tag" >&2
    exit 1
fi
echo "[provision] installing 3x-ui ${QUI_VERSION} (${QUI_ARCH})"

tarball="q-ui-linux-${QUI_ARCH}.tar.gz"
url="https://github.com/${REPO}/releases/download/${QUI_VERSION}/${tarball}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Download the RELEASED binary tarball (no Go build inside the image).
curl -fL4 --retry 3 -o "${tmp}/${tarball}" "$url"

# Extract into /usr/local/ (the tarball contains an q-ui/ directory).
systemctl stop q-ui > /dev/null 2>&1 || true
rm -rf "$QUI_DIR"
tar -xzf "${tmp}/${tarball}" -C /usr/local/
chmod +x "${QUI_DIR}/q-ui" "${QUI_DIR}/q-ui.sh"
chmod +x "${QUI_DIR}"/bin/* 2> /dev/null || true

# Install the q-ui management CLI.
if [ -f "${QUI_DIR}/q-ui.sh" ]; then
    cp -f "${QUI_DIR}/q-ui.sh" /usr/bin/q-ui
else
    curl -fL4 -o /usr/bin/q-ui "https://raw.githubusercontent.com/${REPO}/main/q-ui.sh"
fi
chmod +x /usr/bin/q-ui
mkdir -p /var/log/q-ui

# Panel systemd unit (Ubuntu base => debian variant).
install -m 644 "${QUI_DIR}/q-ui.service.debian" /etc/systemd/system/q-ui.service

# First-boot per-instance credential unit + script (uploaded to /tmp/firstboot).
install -m 755 /tmp/firstboot/q-ui-firstboot.sh "${QUI_DIR}/q-ui-firstboot.sh"
install -m 644 /tmp/firstboot/q-ui-firstboot.service /etc/systemd/system/q-ui-firstboot.service

systemctl daemon-reload
# Enable (start on next boot) but do NOT start now — there is no DB yet.
systemctl enable q-ui-firstboot.service
systemctl enable q-ui.service

# Belt-and-braces: ensure no DB / sentinel was created during provisioning.
rm -f /etc/q-ui/q-ui.db /etc/q-ui/q-ui.db-* /etc/q-ui/.firstboot-done 2> /dev/null || true

echo "[provision] done — panel installed, services enabled, NO database initialized."
