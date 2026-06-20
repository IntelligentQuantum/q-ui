#!/bin/bash
#
# Lightsail snapshot provisioning user-data (used by build-snapshot.sh).
#
# Installs the q-ui panel into a build instance but creates NO database and
# NO credentials, and enables the first-boot unit. The instance is then snapshot
# so that every instance launched from the snapshot generates its own unique
# credentials on first boot (see deploy/firstboot/).
#
# This is the Lightsail equivalent of deploy/packer/scripts/provision.sh. It is
# NOT for end users — use deploy/lightsail/launch-script.sh for a direct install.
set -e
export DEBIAN_FRONTEND=noninteractive

REPO=IntelligentQuantum/q-ui
QUI_DIR=/usr/local/q-ui
RAW="https://raw.githubusercontent.com/${REPO}/main"

apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates curl tar tzdata socat openssl cron jq

ARCH=$(dpkg --print-architecture) # amd64 | arm64
VER=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | jq -r .tag_name)
if [ -z "$VER" ] || [ "$VER" = "null" ]; then
    echo "failed to resolve q-ui version" >&2
    exit 1
fi

tmp=$(mktemp -d)
curl -fL4 --retry 3 -o "${tmp}/x.tar.gz" \
    "https://github.com/${REPO}/releases/download/${VER}/q-ui-linux-${ARCH}.tar.gz"

systemctl stop q-ui > /dev/null 2>&1 || true
rm -rf "$QUI_DIR"
tar -xzf "${tmp}/x.tar.gz" -C /usr/local/
chmod +x "${QUI_DIR}/q-ui" "${QUI_DIR}/q-ui.sh"
chmod +x "${QUI_DIR}"/bin/* 2> /dev/null || true
cp -f "${QUI_DIR}/q-ui.sh" /usr/bin/q-ui
chmod +x /usr/bin/q-ui
mkdir -p /var/log/q-ui

# Panel + first-boot systemd units.
install -m 644 "${QUI_DIR}/q-ui.service.debian" /etc/systemd/system/q-ui.service
curl -fL4 -o "${QUI_DIR}/q-ui-firstboot.sh" "${RAW}/deploy/firstboot/q-ui-firstboot.sh"
curl -fL4 -o /etc/systemd/system/q-ui-firstboot.service "${RAW}/deploy/firstboot/q-ui-firstboot.service"
chmod 755 "${QUI_DIR}/q-ui-firstboot.sh"
chmod 644 /etc/systemd/system/q-ui-firstboot.service

systemctl daemon-reload
systemctl enable q-ui-firstboot.service
systemctl enable q-ui.service

# No DB, no creds in the image — first boot generates them per-instance.
rm -f /etc/q-ui/q-ui.db /etc/q-ui/q-ui.db-* /etc/q-ui/.firstboot-done 2> /dev/null || true

# Marker that build-snapshot.sh polls for over SSH.
touch /var/lib/q-ui-provision-done
echo "[snapshot-userdata] provisioned q-ui ${VER} (${ARCH}); no DB created."
