# Deploying ApexFi on more than one server

## 1. Environment (backend)
```
APP_ENV=production
ALLOWED_ORIGINS=https://your-frontend.example
TRUST_PROXY=true            # only when a trusted proxy sits in front
FORCE_HTTPS=true            # redirect http -> https (needs TRUST_PROXY)
RATE_LIMIT_REDIS_URL=redis://redis-host:6379/0   # shared rate limits
READONLY_DB_PASSWORD=<strong password>
```
`APP_ENV=production` hides `/docs`, adds HSTS over HTTPS and refuses the default read-only DB password.

## 2. Run the API behind the proxy
```
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips="127.0.0.1"
```
Each worker loads every model (several GB of RAM). Use `--workers 1` on small machines, and add Redis only when you run several workers or servers.

## 3. TLS (HTTPS) at the proxy
TLS is handled by the proxy or the hosting platform, not by Python.

**Caddy** (gets and renews the certificate automatically):
```
api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

**NGINX** (certificate from Let's Encrypt / certbot):
```
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name api.example.com;
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Hosting platforms such as Vercel, Render, Railway and Hugging Face Spaces provide HTTPS automatically.

## 4. Redis
Any Redis 6+ works (managed or self-hosted). Keep it private (not on the public internet) and, if it has a password, put it in the URL: `redis://:password@host:6379/0`.

## 5. Quick checks
```
curl -sI https://api.example.com/health                # 200
curl -sI http://api.example.com/api/datasets/          # 308 redirect to https
curl -sI https://api.example.com/api/datasets/ | grep -i strict-transport
```
