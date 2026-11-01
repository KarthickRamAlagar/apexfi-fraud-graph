#!/bin/bash
# Run ON THE SERVER (Ubuntu, Oracle Always Free) after the bundle is extracted to ~/apexfi.
#   bash ~/apexfi/server/setup_server.sh  YOUR-NAME.duckdns.org
# Safe to run again.
set -euo pipefail
DOMAIN="${1:?Usage: setup_server.sh your-name.duckdns.org}"
APP=/opt/apexfi

echo "== 1/7 system packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-pip python3-dev build-essential libgomp1 caddy iptables-persistent curl rsync

echo "== 2/7 swap file (safety net for memory spikes while loading the graphs)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== 3/7 app folder"
sudo mkdir -p "$APP"
sudo chown "$USER":"$USER" "$APP"
# copy code but keep downloaded assets (.venv, models, data) when updating
rsync -a --exclude '/.venv' --exclude '/ieee_cis_graph.pt' --exclude '/dgraph_fin_graph.pt' \
      --exclude '/ml/checkpoints' --exclude '/data' "$HOME/apexfi/" "$APP/"

echo "== 4/7 python environment (the first install takes several minutes)"
[ -d "$APP/.venv" ] || python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install --upgrade pip
"$APP/.venv/bin/pip" install -r "$APP/requirements.txt"

echo "== 5/7 settings file"
if [ ! -f /etc/apexfi.env ]; then
  sudo cp "$APP/server/apexfi.env.example" /etc/apexfi.env
  sudo chown "$USER":"$USER" /etc/apexfi.env
  chmod 600 /etc/apexfi.env
  echo ">> Created /etc/apexfi.env - EDIT IT NOW:  nano /etc/apexfi.env   (tokens, origins, keys)"
fi

echo "== 6/7 service + web server"
sed "s|__USER__|$USER|g" "$APP/server/apexfi-api.service" | sudo tee /etc/systemd/system/apexfi-api.service >/dev/null
sed "s|__DOMAIN__|$DOMAIN|g" "$APP/server/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable apexfi-api >/dev/null
sudo systemctl restart caddy

echo "== 7/7 open ports 80 and 443 in the server firewall"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT
done
sudo netfilter-persistent save >/dev/null

cat <<MSG

Setup done. Next:
  1) nano /etc/apexfi.env            # fill in the values, save
  2) sudo systemctl start apexfi-api # first start downloads ~2 GB of models + data
  3) journalctl -u apexfi-api -f     # watch the log (Ctrl+C to stop watching)
  4) curl -s https://$DOMAIN/api/dashboard/summary | head -c 300
MSG
