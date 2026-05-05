#!/usr/bin/env bash
# Smoke-test Amazon Bedrock Claude 3.5 Haiku from the CLI.
# Usage:
#   export AWS_BEARER_TOKEN_BEDROCK=<your bedrock api key>
#   ./infra/test-bedrock.sh
#
# Confirms region / model access / network are all wired up before
# we burn build hours debugging in Lambda.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
# Claude Haiku 4.5 — current-gen, fast, cheap. Cross-region inference profile.
MODEL_ID="us.anthropic.claude-haiku-4-5-20251001-v1:0"

if [ -z "${AWS_BEARER_TOKEN_BEDROCK:-}" ]; then
  echo "ERROR: export AWS_BEARER_TOKEN_BEDROCK first (your Bedrock long-term API key)" >&2
  exit 1
fi

echo "→ Calling Bedrock Haiku in $REGION ..."

RESPONSE=$(curl -sS -X POST \
  "https://bedrock-runtime.${REGION}.amazonaws.com/model/${MODEL_ID}/converse" \
  -H "Authorization: Bearer ${AWS_BEARER_TOKEN_BEDROCK}" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": [{"text": "Reply with just the word OK."}]}
    ],
    "inferenceConfig": {"maxTokens": 10, "temperature": 0}
  }')

echo "→ Raw response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

TEXT=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['output']['message']['content'][0]['text'])" 2>/dev/null || echo "")

if [[ "$TEXT" == *"OK"* ]]; then
  echo
  echo "✅ Bedrock end-to-end works. Model said: $TEXT"
  exit 0
else
  echo
  echo "❌ Unexpected response. Check key, region, model access." >&2
  exit 1
fi
