# Security Incident Tracker — 3-Tier App on AWS

A small incident-reporting app deployed as a classic 3-tier architecture on AWS.

```
Browser ──80/443──> [Web tier: Nginx on EC2] ──> [App tier: Node/Express :3000] ──3306──> [DB tier: MySQL]
```

## Stack
- **Web:** Nginx serving static HTML/JS, reverse-proxying `/api` to Node
- **App:** Node.js + Express, JWT auth, bcrypt, helmet, rate limiting
- **DB:** MySQL (RDS or EC2), parameterized queries, least-privilege DB user

## Security controls
- Passwords hashed with bcrypt (cost 12); JWT expires in 2h
- All SQL uses prepared statements (no SQL injection)
- Input validation + enum checks; frontend uses `textContent` (no XSS)
- Rate limiting on login/register; helmet security headers
- Secrets in `.env`, never in git
- Security Groups: Web SG → 80/443 from anywhere; DB SG → 3306 **only from the app/web SG**; SSH only from my IP
- Node binds to 127.0.0.1 (not publicly reachable)

## Deploy (Ubuntu EC2)
```bash
sudo apt update && sudo apt install -y nginx nodejs npm mysql-client
git clone <your-repo> && cd incident-tracker

# 1. Database (from EC2, against your MySQL endpoint)
mysql -h <DB_HOST> -u admin -p < db/schema.sql
# then create the least-privilege user (see bottom of schema.sql)

# 2. Backend
cd backend && npm install
cp .env.example .env && nano .env      # fill DB details + JWT_SECRET (openssl rand -hex 32)
node server.js                          # test, then Ctrl+C

# 3. Run as a service
sudo tee /etc/systemd/system/tracker.service <<'UNIT'
[Unit]
Description=Incident Tracker API
After=network.target
[Service]
WorkingDirectory=/home/ubuntu/incident-tracker/backend
ExecStart=/usr/bin/node server.js
Restart=always
User=ubuntu
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now tracker

# 4. Frontend + Nginx
sudo mkdir -p /var/www/incident-tracker && sudo cp frontend/index.html /var/www/incident-tracker/
sudo cp nginx/incident-tracker.conf /etc/nginx/sites-available/incident-tracker
sudo ln -sf /etc/nginx/sites-available/incident-tracker /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Test: `curl localhost/api/health` → `{"status":"ok","db":"connected"}`

## Next improvements
HTTPS via ACM + ALB, private subnet for DB, Terraform for the infra, CloudWatch logs/alarms, CI/CD with GitHub Actions.
