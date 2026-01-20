#!/bin/bash
# Wrapper that runs a process with file-based restart capability.
# Usage: restart-wrapper.sh <service-name> <command> [args...]
#
# Creates a restart trigger file at /workspace/.restart-<service-name>.
# Touch this file to trigger a graceful restart of the wrapped process.

SERVICE_NAME="$1"
shift

if [ -z "$SERVICE_NAME" ]; then
    echo "[restart-wrapper] Error: service name required"
    exit 1
fi

RESTART_FILE="/workspace/.restart-${SERVICE_NAME}"
RESTART_REQUESTED=false

while true; do
    rm -f "$RESTART_FILE"
    RESTART_REQUESTED=false
    echo "[restart-wrapper] Starting ${SERVICE_NAME}..."

    "$@" &
    PID=$!

    # Monitor for restart signal or process exit
    while kill -0 $PID 2>/dev/null; do
        if [ -f "$RESTART_FILE" ]; then
            echo "[restart-wrapper] Restart signal received for ${SERVICE_NAME}..."
            RESTART_REQUESTED=true
            kill $PID 2>/dev/null || true
            wait $PID 2>/dev/null || true
            rm -f "$RESTART_FILE"
            break
        fi
        sleep 1
    done

    # If we requested the restart, loop immediately
    if [ "$RESTART_REQUESTED" = true ]; then
        continue
    fi

    # Process exited on its own, get exit code
    wait $PID 2>/dev/null
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
        echo "[restart-wrapper] ${SERVICE_NAME} exited with code ${EXIT_CODE}"
        exit $EXIT_CODE
    fi
    # Clean exit, restart the loop (dev server might exit cleanly on HMR issues)
    echo "[restart-wrapper] ${SERVICE_NAME} exited cleanly, restarting..."
done
