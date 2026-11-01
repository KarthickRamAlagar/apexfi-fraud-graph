#!/bin/bash
# After uploading a NEW bundle:  bash ~/apexfi/server/update_server.sh
set -euo pipefail
APP=/opt/apexfi
rsync -a --exclude '/.venv' --exclude '/ieee_cis_graph.pt' --exclude '/dgraph_fin_graph.pt' \
      --exclude '/ml/checkpoints' --exclude '/data' "$HOME/apexfi/" "$APP/"
"$APP/.venv/bin/pip" install -q -r "$APP/requirements.txt"
sudo systemctl restart apexfi-api
echo "Restarted. Watch: journalctl -u apexfi-api -f"
