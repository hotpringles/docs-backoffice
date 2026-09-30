#!/usr/bin/env bash
# GitHub이 보내는 것과 같은 서명이 붙은 push webhook 요청을 흉내 낸다.
#
# 사용법: scripts/simulate-webhook.sh <서버 주소> <비밀키> [ref] [바뀐 문서 경로]
# 예:     scripts/simulate-webhook.sh http://localhost:3112 test-secret
#         scripts/simulate-webhook.sh http://localhost:3112 test-secret refs/heads/feature/x
set -euo pipefail

BASE="${1:?서버 주소를 넣어 주세요. 예: http://localhost:3112}"
SECRET="${2:?webhook 비밀키를 넣어 주세요}"
REF="${3:-refs/heads/develop}"
FILE="${4:-frontend/docs/plan/m0-scaffolding.md}"

BODY=$(printf '{"ref":"%s","after":"simulated","commits":[{"modified":["%s"]}]}' "$REF" "$FILE")
SIGNATURE="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

curl -sS -w '\nHTTP %{http_code}\n' -X POST "$BASE/api/github-webhook" \
  -H 'content-type: application/json' \
  -H 'x-github-event: push' \
  -H "x-hub-signature-256: $SIGNATURE" \
  --data-binary "$BODY"
