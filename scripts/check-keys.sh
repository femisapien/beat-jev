#!/bin/sh
set -eu
: "${TYPESAFE_API_KEY:?Set TYPESAFE_API_KEY when deploying the Blueprint}"
: "${DATABASE_URL:?The Blueprint must include its Postgres database}"
