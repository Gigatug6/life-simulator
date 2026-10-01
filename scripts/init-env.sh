#!/bin/sh
cd "$(dirname "$0")/.." && printf "HOST_UID=%s\nHOST_GID=%s\nCHOKIDAR_USEPOLLING=false\n" "$(id -u)" "$(id -g)" > .env
