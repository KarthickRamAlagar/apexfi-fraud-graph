# Permanent backend on Oracle Cloud Always Free

Server: Ubuntu 24.04 (ARM), 2 CPUs, 12 GB RAM, 200 GB disk. Cost: 0 (identity check with a card at signup).
App: FastAPI in DuckDB mode on the Parquet copy of the Gold layer; models and data come from your private
Hugging Face repos. HTTPS by Caddy with a free DuckDNS name.

## 1. Oracle account and server (browser)
1. cloud.oracle.com -> Sign up. Pick the home region **Mumbai** or **Hyderabad** (cannot be changed later).
2. Compute -> Instances -> Create instance:
   - Image: **Canonical Ubuntu 24.04** (aarch64)
   - Shape: **Ampere VM.Standard.A1.Flex**, **2 OCPU, 12 GB** memory
   - Networking: keep the default VCN, **assign a public IPv4 address**
   - SSH keys: paste the contents of `~/.ssh/apexfi_oracle.pub`
   - Boot volume: 100-150 GB
   - If it says "Out of host capacity": try again later or another availability domain.
3. Instance page -> Subnet -> Default Security List -> Add Ingress Rules:
   source `0.0.0.0/0`, TCP, destination ports `80` and `443` (add two rules).
4. Note the instance **public IP**.

## 2. Free name (browser)
duckdns.org -> sign in -> create a name, e.g. `apexfi` -> set its IP to the instance public IP.
Your address will be `https://apexfi.duckdns.org`.

## 3. Upload the code (Git Bash on your PC)
```bash
cd /d/apexfi-demo
uv run python -m deploy.make_bundle
scp -i ~/.ssh/apexfi_oracle apexfi_bundle.tar.gz ubuntu@SERVER_IP:~
```

## 4. Install (on the server)
```bash
ssh -i ~/.ssh/apexfi_oracle ubuntu@SERVER_IP
tar xzf apexfi_bundle.tar.gz
bash ~/apexfi/server/setup_server.sh apexfi.duckdns.org
nano /etc/apexfi.env          # paste the READ token, your Vercel address, LLM keys; save
sudo systemctl start apexfi-api
journalctl -u apexfi-api -f   # watch; the first start downloads ~2 GB
```
Check: `curl -s https://apexfi.duckdns.org/api/dashboard/summary | head -c 300`

## 5. Update later
Make a new bundle on your PC, `scp` it, then on the server:
```bash
tar xzf apexfi_bundle.tar.gz && bash ~/apexfi/server/update_server.sh
```

## Weekly check (2 minutes)
Open the site; read any Oracle email. Oracle only reclaims machines that stay under 20% CPU, network AND
memory for 7 days; the loaded models keep memory high. Keep a copy of `/etc/apexfi.env` somewhere private.
