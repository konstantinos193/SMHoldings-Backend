#!/bin/bash
################################################################################
# Traefik as the edge proxy for api.smholdings.gr, on the stefanos-net network.
#
#   bash install.sh install    # build the edge and cut over from nginx
#   bash install.sh status     # what Traefik has loaded and serves
#   bash install.sh certs      # swap certbot's cert for the ACME one, once issued
#   bash install.sh rollback   # Traefik off, nginx back on 80/443
#
# Run on the host as root. Everything it writes outside $HOME is under
# /etc/stefanos/traefik plus one cron file and the /root deploy scripts.
#
# LAYOUT
#
#   network     stefanos-net -- Traefik reaches the app by container name and
#               its port inside the container (http://stefanos-blue:3001),
#               never through a port published on the host.
#   container   stefanos-traefik, publishing 80 and 443, API on 127.0.0.1:8099.
#   static      /etc/stefanos/traefik/traefik.yml (read once at container start)
#   dynamic     /etc/stefanos/traefik/dynamic/*.yml, watched and hot-reloaded:
#                 00-edge.yml     shared middlewares    this repo's edge.yml
#                 api.yml         api.smholdings.gr     deploy-traefik-route.sh
#                 zz-bootstrap-certs.yml  certbot's cert, until ACME has its own
#   certs       Let's Encrypt via Traefik's own ACME client, in acme/acme.json.
#   logs        /etc/stefanos/traefik/logs/ -- JSON files, not stdout, so they
#               survive the container the way /root/stefanos-logs does for the
#               app. traefik.log rotates natively (Traefik v3); access.log is
#               rotated by cron + a USR1 signal (Traefik reopens on USR1).
#
# CUTOVER: `install` first runs Traefik on loopback-only ports and proves the
# routes load and the API answers through it. Only then does it stop nginx and
# republish 80/443 -- a gap of about a second, the time to recreate the
# container. `rollback` reverses it: the nginx config is left in place on
# purpose, only stopped and disabled.
################################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODE=${1:-}

NAME=stefanos-traefik
TRAEFIK_IMAGE=${TRAEFIK_IMAGE:-traefik:v3.5.3}
DOCKER_NETWORK=${DOCKER_NETWORK:-stefanos-net}
TRAEFIK_DIR=${TRAEFIK_DIR:-/etc/stefanos/traefik}
DYNAMIC_DIR=$TRAEFIK_DIR/dynamic
LOG_DIR=$TRAEFIK_DIR/logs
BOOTSTRAP_DIR=$TRAEFIK_DIR/bootstrap
BOOTSTRAP_CERTS=$DYNAMIC_DIR/zz-bootstrap-certs.yml
API_DOMAIN=${API_DOMAIN:-api.smholdings.gr}
API_URL=http://127.0.0.1:8099
ROUTE_SCRIPT=${ROUTE_SCRIPT:-/root/deploy-traefik-route.sh}

# Loopback-only staging ports, checked before nginx loses 80/443.
STAGE_HTTP=18080
STAGE_HTTPS=18443

say()  { echo -e "${YELLOW}$*${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}" >&2; }

live_colour() {
    if docker ps --format '{{.Names}}' | grep -qx stefanos-green && \
       ! docker ps --format '{{.Names}}' | grep -qx stefanos-blue; then
        echo green; return
    fi
    echo blue
}

# ------------------------------------------------------------------------------
# Static configuration
# ------------------------------------------------------------------------------
write_static_config() {
    local tmp
    tmp=$(mktemp)
    cat > "$tmp" <<EOF
# Written by stefanos-backend/docker/traefik/install.sh on $(date -u '+%Y-%m-%d %H:%M:%S UTC').
# Read once at container start: change it here, then docker restart $NAME.

global:
  checkNewVersion: false
  sendAnonymousUsage: false

# Traefik's own log: JSON to a file with v3's native rotation. Off stdout, so
# 'docker logs' is not the way to read it -- open the file.
log:
  level: INFO
  format: json
  filePath: /logs/traefik.log
  maxSize: 10
  maxBackups: 3
  maxAge: 30
  compress: true

# Access log: one JSON line per request. Duration (whole request) and
# OriginDuration (the app's part) come free in JSON -- the two numbers an nginx
# log_format exists to subtract. No native rotation for accessLog in v3:
# /etc/cron.daily/stefanos-traefik-logs moves it aside and USR1s the container,
# which is the documented way to make Traefik reopen the file.
accessLog:
  format: json
  filePath: /logs/access.log
  bufferingSize: 100
  fields:
    defaultMode: keep
    headers:
      defaultMode: drop
      names:
        User-Agent: keep
        Referer: keep
        Origin: keep
        X-Request-Id: keep

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true

  websecure:
    address: ":443"
    asDefault: true
    transport:
      respondingTimeouts:
        # Reading the whole request, body included. 300s so a 25 MB upload on
        # hotel WiFi is not cut off (Traefik's default is 60s).
        readTimeout: 300s
        writeTimeout: 0s
        idleTimeout: 180s
    http:
      tls:
        certResolver: letsencrypt

  # The API and /ping. Published on the host's loopback only.
  traefik:
    address: ":8099"

api:
  insecure: true
  dashboard: false
ping:
  entryPoint: traefik

serversTransport:
  maxIdleConnsPerHost: 32
  forwardingTimeouts:
    dialTimeout: 10s
    # nginx: proxy_read_timeout equivalent, for slow endpoints.
    responseHeaderTimeout: 300s
    # Short, so a deploy's drain is not held up by idle pooled connections.
    idleConnTimeout: 15s

providers:
  file:
    directory: /etc/traefik/dynamic
    watch: true

# No email: Let's Encrypt stopped sending expiry mail in 2025, and Traefik
# renews 30 days ahead on its own.
certificatesResolvers:
  letsencrypt:
    acme:
      storage: /etc/traefik/acme/acme.json
      httpChallenge:
        entryPoint: web
EOF
    install -m 0644 "$tmp" "$TRAEFIK_DIR/traefik.yml"
    rm -f "$tmp"
    ok "$TRAEFIK_DIR/traefik.yml"
}

# ------------------------------------------------------------------------------
# certbot's certificate, served until Traefik's own ACME cert exists
# ------------------------------------------------------------------------------
stage_bootstrap_cert() {
    mkdir -p "$BOOTSTRAP_DIR/$API_DOMAIN"
    cp -L "/etc/letsencrypt/live/$API_DOMAIN/fullchain.pem" "$BOOTSTRAP_DIR/$API_DOMAIN/fullchain.pem"
    cp -L "/etc/letsencrypt/live/$API_DOMAIN/privkey.pem" "$BOOTSTRAP_DIR/$API_DOMAIN/privkey.pem"
    chmod 0600 "$BOOTSTRAP_DIR/$API_DOMAIN/privkey.pem"
    cat > "$BOOTSTRAP_CERTS.tmp" <<EOF
# Written by install.sh. Certbot's certificate for $API_DOMAIN, served until
# Traefik's ACME client has its own -- then \`install.sh certs\` removes this.
tls:
  certificates:
    - certFile: /etc/traefik/bootstrap/$API_DOMAIN/fullchain.pem
      keyFile: /etc/traefik/bootstrap/$API_DOMAIN/privkey.pem
EOF
    mv "$BOOTSTRAP_CERTS.tmp" "$BOOTSTRAP_CERTS"
    ok "bootstrap certificate for $API_DOMAIN"
}

acme_has() {
    grep -q "\"main\": \"$API_DOMAIN\"\|\"main\":\"$API_DOMAIN\"" "$TRAEFIK_DIR/acme/acme.json" 2>/dev/null
}

# ------------------------------------------------------------------------------
# Access-log rotation: accessLog has no native rotation in v3. Move the file,
# USR1 the container (Traefik reopens it), compress, prune past 30 days.
# ------------------------------------------------------------------------------
install_rotation() {
    # No cron on this box -- a systemd oneshot+timer is the same shape and
    # needs no new package.
    mkdir -p /etc/stefanos/bin
    cat > /etc/stefanos/bin/rotate-traefik-logs.sh <<'EOF'
#!/bin/sh
# Rotate Traefik's access.log: mv + USR1 (Traefik reopens the path), gzip, keep 30d.
cd /etc/stefanos/traefik/logs || exit 0
[ -f access.log ] || exit 0
mv access.log "access-$(date +%F).log" 2>/dev/null || exit 0
docker kill -s USR1 stefanos-traefik >/dev/null 2>&1 || true
sleep 2
gzip -f access-*.log 2>/dev/null || true
find . -name 'access-*.log.gz' -mtime +30 -delete
EOF
    chmod 0755 /etc/stefanos/bin/rotate-traefik-logs.sh

    cat > /etc/systemd/system/stefanos-traefik-logrotate.service <<'EOF'
[Unit]
Description=Rotate Traefik access log (USR1 reopen)

[Service]
Type=oneshot
ExecStart=/etc/stefanos/bin/rotate-traefik-logs.sh
EOF
    cat > /etc/systemd/system/stefanos-traefik-logrotate.timer <<'EOF'
[Unit]
Description=Daily Traefik access.log rotation

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now stefanos-traefik-logrotate.timer >/dev/null 2>&1
    ok "stefanos-traefik-logrotate.timer (daily 03:30 UTC)"
}

# ------------------------------------------------------------------------------
# The container
# ------------------------------------------------------------------------------
start_container() {  # <"loopback"|"live">
    local mode=$1 ports
    if [ "$mode" = live ]; then
        ports="-p 80:80 -p 443:443 -p 127.0.0.1:8099:8099"
    else
        ports="-p 127.0.0.1:$STAGE_HTTP:80 -p 127.0.0.1:$STAGE_HTTPS:443 -p 127.0.0.1:8099:8099"
    fi
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    # shellcheck disable=SC2086
    docker run -d --name "$NAME" \
        --network "$DOCKER_NETWORK" \
        --restart unless-stopped \
        $ports \
        -v "$TRAEFIK_DIR/traefik.yml:/etc/traefik/traefik.yml:ro" \
        -v "$DYNAMIC_DIR:/etc/traefik/dynamic:ro" \
        -v "$TRAEFIK_DIR/acme:/etc/traefik/acme" \
        -v "$BOOTSTRAP_DIR:/etc/traefik/bootstrap:ro" \
        -v "$LOG_DIR:/logs" \
        --health-cmd "traefik healthcheck --ping" \
        --health-interval 30s --health-timeout 5s --health-retries 3 \
        "$TRAEFIK_IMAGE" >/dev/null
}

wait_for_api() {
    local _
    for _ in $(seq 1 20); do
        curl -sf --max-time 2 "$API_URL/ping" >/dev/null 2>&1 && return 0
        sleep 1
    done
    return 1
}

# Prove from Traefik's side that the api.yml routes loaded, then through the
# proxy itself. Same contract as the route script's own check.
verify_routes_loaded() {
    local svc router
    svc=$(curl -sf --max-time 3 "$API_URL/api/http/services/stefanos@file" 2>/dev/null) || return 1
    router=$(curl -sf --max-time 3 "$API_URL/api/http/routers/stefanos-api@file" 2>/dev/null) || return 1
    echo "$router" | grep -q '"status":"enabled"' || return 1
    echo "$svc" | grep -qF '"loadBalancer"' || return 1
}

probe_https() {  # <host port>
    curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
        --resolve "$API_DOMAIN:$1:127.0.0.1" \
        "https://$API_DOMAIN:$1/api/health" 2>/dev/null || true
}

# ------------------------------------------------------------------------------
case "$MODE" in
install)
    say "==> stefanos Traefik edge install"

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    [ -f "$SCRIPT_DIR/edge.yml" ] || { fail "edge.yml not next to install.sh"; exit 1; }
    [ -f "/etc/letsencrypt/live/$API_DOMAIN/fullchain.pem" ] || \
        fail "no certbot certificate at /etc/letsencrypt/live/$API_DOMAIN -- ACME will have to get one cold (HTTP-01 on port 80 after cutover)"

    mkdir -p "$DYNAMIC_DIR" "$LOG_DIR" "$BOOTSTRAP_DIR" "$TRAEFIK_DIR/acme"
    touch "$TRAEFIK_DIR/acme/acme.json" && chmod 0600 "$TRAEFIK_DIR/acme/acme.json"

    # The route script deploy.sh will call, kept next to it in /root.
    if [ -f "$SCRIPT_DIR/../../deploy-traefik-route.sh" ]; then
        install -m 0755 "$SCRIPT_DIR/../../deploy-traefik-route.sh" "$ROUTE_SCRIPT"
        ok "$ROUTE_SCRIPT"
    elif [ ! -f "$ROUTE_SCRIPT" ]; then
        fail "deploy-traefik-route.sh not found next to docker/ and not at $ROUTE_SCRIPT"
        exit 1
    fi

    write_static_config
    install -m 0644 "$SCRIPT_DIR/edge.yml" "$DYNAMIC_DIR/00-edge.yml"
    ok "$DYNAMIC_DIR/00-edge.yml"
    [ -f "/etc/letsencrypt/live/$API_DOMAIN/fullchain.pem" ] && stage_bootstrap_cert

    # The live colour's route file, written exactly as the next deploy will.
    TRAEFIK_ROUTE_VERIFY=0 bash "$ROUTE_SCRIPT" "stefanos-$(live_colour)"

    install_rotation

    say "==> staging on loopback ports $STAGE_HTTP/$STAGE_HTTPS"
    start_container loopback
    wait_for_api || { docker logs --tail 20 "$NAME" 2>&1 | sed 's/^/    /'; fail "Traefik API did not come up"; exit 1; }
    for _ in $(seq 1 15); do verify_routes_loaded && break; sleep 1; done
    verify_routes_loaded || { fail "routes never loaded"; docker logs --tail 20 "$NAME" | sed 's/^/    /'; exit 1; }
    ok "routes loaded"

    staged=$(probe_https $STAGE_HTTPS)
    case "$staged" in
        502|503|504|000|"") fail "staged probe through Traefik failed ($staged)"; docker logs --tail 20 "$NAME" | sed 's/^/    /'; exit 1 ;;
        *) ok "staged https probe: HTTP $staged" ;;
    esac

    say "==> cutover: nginx off, Traefik on 80/443"
    systemctl stop nginx
    start_container live
    wait_for_api || { fail "Traefik did not come up on live ports"; systemctl start nginx; exit 1; }

    live=$(probe_https 443)
    case "$live" in
        502|503|504|000|"") fail "live probe failed ($live) -- rolling back to nginx"; docker rm -f "$NAME"; systemctl start nginx; exit 1 ;;
        *) ok "live https probe: HTTP $live" ;;
    esac

    systemctl disable nginx >/dev/null 2>&1 || true
    systemctl stop certbot.timer 2>/dev/null || true
    systemctl disable certbot.timer 2>/dev/null || true
    ok "nginx stopped and disabled (config left in place for rollback)"
    ok "certbot.timer disabled -- Traefik's ACME owns renewals now"

    say "==> waiting for ACME certificate for $API_DOMAIN"
    for _ in $(seq 1 60); do acme_has && break; sleep 3; done
    if acme_has; then
        rm -f "$BOOTSTRAP_CERTS"
        ok "ACME issued $API_DOMAIN -- bootstrap certificate removed"
    else
        fail "ACME has not issued $API_DOMAIN yet; certbot's cert is still serving. Run: bash install.sh certs"
    fi

    say "==> done. status: bash install.sh status | logs: $LOG_DIR"
    ;;

status)
    docker ps --filter "name=$NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo
    curl -sf "$API_URL/api/http/routers" 2>/dev/null | tr ',' '\n' | grep -E '"name"|"status"|"rule"' || fail "Traefik API unreachable on $API_URL"
    echo
    ls -lh "$LOG_DIR" 2>/dev/null
    ;;

certs)
    if acme_has; then
        rm -f "$BOOTSTRAP_CERTS"
        ok "ACME holds $API_DOMAIN -- bootstrap certificate removed"
    else
        fail "acme.json does not have $API_DOMAIN yet"
        docker logs --tail 15 "$NAME" 2>&1 | sed 's/^/    /' || true
        exit 1
    fi
    ;;

rollback)
    say "==> rollback: Traefik off, nginx back"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    systemctl disable --now stefanos-traefik-logrotate.timer >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/stefanos-traefik-logrotate.{timer,service} /etc/stefanos/bin/rotate-traefik-logs.sh
    systemctl daemon-reload
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl start nginx
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true
    ok "nginx back on 80/443; Traefik config kept under $TRAEFIK_DIR"
    ;;

*)
    echo "Usage: $0 install|status|certs|rollback" >&2
    exit 2
    ;;
esac
