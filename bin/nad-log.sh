#!/usr/bin/env bash

LOG="@@LOG@@/nad.log"
PINO="@@PREFIX@@/lib/node_modules/.bin/pino"

[[ -f $LOG ]] || {
    echo "Unable to find NAD log ($LOG)"
    exit 1
}

[[ -x $PINO ]] || {
    echo "Unable to find required command ($PINO)"
    exit 1
}

tail -F $LOG | $PINO
