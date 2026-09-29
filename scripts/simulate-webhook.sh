#!/usr/bin/env bash
# GitHub이 보내는 것과 같은 서명이 붙은 push webhook 요청을 흉내 낸다.
#
# 사용법: scripts/simulate-webhook.sh <서버 주소> <비밀키> [ref] [바뀐 문서 경로] [커밋 SHA]
# 예:     scripts/simulate-webhook.sh http://localhost:3112 test-secret
#         scripts/simulate-webhook.sh http://localhost:3112 test-secret refs/heads/feature/x
#         scripts/simulate-webhook.sh http://localhost:3112 test-secret refs/heads/develop frontend/docs/plan/m0-scaffolding.md same-sha
#
# 커밋 SHA를 생략하면 실행할 때마다 새 값을 쓴다(그래서 알림이 매번 간다).
# 같은 SHA로 두 번 보내면 두 번째는 알림이 가지 않는다(GitHub 수동 재전송과 같은 상황).
set -euo pipefail

BASE="${1:?서버 주소를 넣어 주세요. 예: http://localhost:3112}"
SECRET="${2:?webhook 비밀키를 넣어 주세요}"
REF="${3:-refs/heads/develop}"
FILE="${4:-frontend/docs/plan/m0-scaffolding.md}"
SHA="${5:-sim-$(date +%s)-$RANDOM}"

BODY=$(printf '{"ref":"%s","after":"%s","commits":[{"modified":["%s"]}]}' "$REF" "$SHA" "$FILE")
SIGNATURE="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

curl -sS -w '\nHTTP %{http_code}\n' -X POST "$BASE/api/github-webhook" \
  -H 'content-type: application/json' \
  -H 'x-github-event: push' \
  -H "x-hub-signature-256: $SIGNATURE" \
  --data-binary "$BODY"
