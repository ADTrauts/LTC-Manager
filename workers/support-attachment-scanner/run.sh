#!/bin/sh
set -eu
# Definitions are retained in the private worker volume; originals exist only in tmpfs.
# The TLS worker independently refuses stale definitions or an unsupported engine.
su -s /bin/sh -c 'exec freshclam --config-file=/etc/clamav/support-freshclam.conf --daemon --foreground --stdout' clamav &
freshclam_pid=$!
clamd --config-file=/etc/clamav/clamd.conf &
clamd_pid=$!
trap 'kill "$freshclam_pid" "$clamd_pid" 2>/dev/null || true' EXIT INT TERM
python3 /opt/support-scanner/worker.py
