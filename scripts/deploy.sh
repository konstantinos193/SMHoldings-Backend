#!/bin/bash
# Blue-green deploy, invoked by .github/workflows/deploy.yml as:
#   /root/deploy.sh ghcr.io/<repo>:<git-sha>
#
# The live copy is /root/deploy.sh on the VPS. Keep the two in sync — this file
# is the source of truth; copy it over after editing.
set -euo pipefail
IMAGE="${1:?Usage: deploy.sh <image>}"

# Every deploy pulls a ~1.2GB image, so reclaim before pulling rather than
# after: a pull that fills the disk takes libsql down with it (the DB is on the
# same volume and starts failing writes with SQLITE_IOERR).
reclaim() {
  # Deploy images are TAGGED (ghcr.io/...:<sha>), so a bare `docker image prune`
  # is a no-op on them — it only removes dangling layers. `-a` is what actually
  # collects superseded deploys. `until` keeps the last few days so the previous
  # image stays cached for a fast rollback; images used by a running container
  # are never removed regardless of age.
  docker image prune -af --filter "until=${1:-72h}" >/dev/null 2>&1 || true
  docker builder prune -f --filter "until=${1:-72h}" >/dev/null 2>&1 || true
}

AVAIL_MB=$(df -Pm / | awk 'NR==2 {print $4}')
echo "[deploy] disk free: ${AVAIL_MB}MB"
if [ "$AVAIL_MB" -lt 5000 ]; then
  echo "[deploy] below 5GB - reclaiming"
  reclaim 72h
  AVAIL_MB=$(df -Pm / | awk 'NR==2 {print $4}')
  if [ "$AVAIL_MB" -lt 3000 ]; then
    echo "[deploy] still below 3GB - reclaiming everything unused"
    reclaim 0h
    AVAIL_MB=$(df -Pm / | awk 'NR==2 {print $4}')
  fi
  echo "[deploy] disk free after reclaim: ${AVAIL_MB}MB"
  if [ "$AVAIL_MB" -lt 2000 ]; then
    echo "[deploy] ABORT: only ${AVAIL_MB}MB free, pulling would risk the database"
    exit 1
  fi
fi

ACTIVE=$(cat /root/.active_color 2>/dev/null || echo blue)
if [ "$ACTIVE" = blue ]; then NEW=green; NEW_PORT=3011; OLD=blue
else NEW=blue; NEW_PORT=3010; OLD=green; fi
echo "[deploy] $ACTIVE->$NEW :$NEW_PORT"
docker pull "$IMAGE"
docker stop stefanos-$NEW 2>/dev/null || true
docker rm stefanos-$NEW 2>/dev/null || true
docker run -d --name stefanos-$NEW --network stefanos-net --add-host=host.docker.internal:172.17.0.1 --restart unless-stopped --env-file /root/stefanos.env -p $NEW_PORT:3001 "$IMAGE"
HEALTHY=0
for i in $(seq 1 30); do
  (echo >/dev/tcp/127.0.0.1/${NEW_PORT}) 2>/dev/null && HEALTHY=1 && break
  sleep 2
done
if [ $HEALTHY -eq 0 ]; then
  echo "[deploy] FAILED - rolling back"
  docker stop stefanos-$NEW 2>/dev/null || true
  docker rm stefanos-$NEW 2>/dev/null || true
  exit 1
fi
cat > /etc/nginx/conf.d/stefanos-upstream.conf <<EOF
upstream stefanos_backend {
  server 127.0.0.1:${NEW_PORT};
  keepalive 32;
}
EOF
nginx -t && nginx -s reload
echo $NEW > /root/.active_color
echo "[deploy] nginx->$NEW :$NEW_PORT"
sleep 5
docker stop stefanos-$OLD 2>/dev/null || true
docker rm stefanos-$OLD 2>/dev/null || true

# The old container is gone, so its image is now unreferenced and collectable.
reclaim 72h
echo "[deploy] disk free: $(df -Pm / | awk 'NR==2 {print $4}')MB"
echo "[deploy] done: $NEW"
