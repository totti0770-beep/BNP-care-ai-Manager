#!/bin/sh
# Take ownership of the index directory, then drop to the unprivileged user.
#
# /app/data is a mount point. A platform volume (Railway, and a fresh Kubernetes
# PVC) is attached root-owned, so the `engine` user cannot create the index
# subdirectory inside it and the process dies on its first import with
# "PermissionError: '/app/data/faiss_index'". The image's build-time chown
# cannot help: it applies to the directory the mount then covers.
#
# So this runs as root for exactly one chown and then hands off. The server
# itself never runs as root — `gosu` replaces this shell with the real command
# as uid 10001, so there is no privileged process left alive afterwards.
#
# Harmless where it is not needed: under docker compose a named volume inherits
# the image directory's ownership, and the chown is then a no-op.
set -e

if [ "$(id -u)" = "0" ]; then
    chown engine:engine /app/data
    exec gosu engine "$@"
fi

exec "$@"
