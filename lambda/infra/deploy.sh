#!/usr/bin/env bash
# PayMate Lambda deploy. Idempotent — safe to re-run.
#
# Provisions: 3 DynamoDB tables (on-demand), 1 IAM exec role,
# 1 Lambda function, 1 HTTP API Gateway with 4 routes.
#
# Requires `aws configure` already done. Region from env or us-east-1.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
STACK="paymate"
ROLE_NAME="${STACK}-lambda-exec"
FUNCTION_NAME="${STACK}-api"
API_NAME="${STACK}-http-api"

cd "$(dirname "$0")/.."   # repo lambda/

echo "→ Region: $REGION"
echo "→ AWS account: $(aws sts get-caller-identity --query Account --output text)"

# -----------------------------------------------------------------------------
# 1. DynamoDB tables — on-demand billing means $0 idle cost.
# -----------------------------------------------------------------------------

create_table() {
  local name=$1
  local key_schema=$2          # e.g. AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE
  local attr_defs=$3           # e.g. AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=N

  if aws dynamodb describe-table --table-name "$name" --region "$REGION" >/dev/null 2>&1; then
    echo "  ✓ $name already exists"
    return
  fi
  echo "  + creating $name"
  aws dynamodb create-table \
    --table-name "$name" \
    --attribute-definitions $attr_defs \
    --key-schema $key_schema \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" >/dev/null
  aws dynamodb wait table-exists --table-name "$name" --region "$REGION"
  echo "  ✓ $name ready"
}

echo ""
echo "→ DynamoDB tables"
create_table "PayMate_Users" \
  "AttributeName=walletAddress,KeyType=HASH" \
  "AttributeName=walletAddress,AttributeType=S"

create_table "PayMate_KybSubmissions" \
  "AttributeName=walletAddress,KeyType=HASH AttributeName=submittedAt,KeyType=RANGE" \
  "AttributeName=walletAddress,AttributeType=S AttributeName=submittedAt,AttributeType=N"

create_table "PayMate_AgentCallLog" \
  "AttributeName=callId,KeyType=HASH" \
  "AttributeName=callId,AttributeType=S"

# -----------------------------------------------------------------------------
# 2. IAM execution role for Lambda.
# -----------------------------------------------------------------------------

echo ""
echo "→ IAM exec role"

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text 2>/dev/null || echo "")

if [ -z "$ROLE_ARN" ]; then
  echo "  + creating $ROLE_NAME"
  TRUST_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query Role.Arn --output text)
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
  # Bedrock perms — Phase 2c will use these.
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AmazonBedrockFullAccess
  echo "  ✓ $ROLE_NAME created"
  echo "  (waiting 10s for IAM propagation)"
  sleep 10
else
  echo "  ✓ $ROLE_NAME exists ($ROLE_ARN)"
fi

# -----------------------------------------------------------------------------
# 3. Lambda function — create or update.
# -----------------------------------------------------------------------------

echo ""
echo "→ Lambda bundle"
bun run build >/dev/null
cd dist && zip -q -r ../lambda.zip . && cd ..
SIZE=$(du -h lambda.zip | cut -f1)
echo "  ✓ lambda.zip ($SIZE)"

# -----------------------------------------------------------------------------
# Encode admin keypair for Lambda env var.
# -----------------------------------------------------------------------------
echo ""
echo "→ Encoding admin keypair for Lambda"
ADMIN_PK=$(bun run infra/encode-admin-key.ts)
if [ -z "$ADMIN_PK" ]; then
  echo "  ❌ failed to encode admin keypair"
  exit 1
fi
echo "  ✓ admin keypair encoded (base58, $(echo -n "$ADMIN_PK" | wc -c | tr -d ' ') chars)"

# Risk agent URL — same API Gateway, /agent/risk path
RISK_AGENT_URL_VAL="https://${API_ID:-wdex0emoga}.execute-api.${REGION}.amazonaws.com/agent/risk"

ENV_VARS="Variables={SOLANA_RPC_URL=https://api.devnet.solana.com,PROGRAM_ID=6Shf4n6CqC2Wyt21YK6Kfw5rtDn2GWKGURvRdysqV92h,SOLANA_ADMIN_PRIVATE_KEY=$ADMIN_PK,RISK_AGENT_URL=$RISK_AGENT_URL_VAL}"

echo ""
echo "→ Lambda function"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "  + updating $FUNCTION_NAME"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://lambda.zip \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment "$ENV_VARS" \
    --timeout 30 \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
else
  echo "  + creating $FUNCTION_NAME"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file fileb://lambda.zip \
    --timeout 30 \
    --memory-size 256 \
    --environment "$ENV_VARS" \
    --region "$REGION" >/dev/null
  aws lambda wait function-active \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi
FUNCTION_ARN=$(aws lambda get-function \
  --function-name "$FUNCTION_NAME" \
  --query Configuration.FunctionArn \
  --output text --region "$REGION")
echo "  ✓ $FUNCTION_ARN"

# -----------------------------------------------------------------------------
# 4. HTTP API Gateway.
# -----------------------------------------------------------------------------

echo ""
echo "→ HTTP API Gateway"
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" --output text)

if [ -z "$API_ID" ]; then
  echo "  + creating $API_NAME"
  API_ID=$(aws apigatewayv2 create-api \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --target "$FUNCTION_ARN" \
    --region "$REGION" \
    --query ApiId --output text)
  # Default $default route + integration is auto-created by --target.
  # Replace with explicit routes for typed paths.
  INTEGRATION_ID=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" --region "$REGION" \
    --query "Items[0].IntegrationId" --output text)
  for route in "POST /kyb/submit" "GET /kyb/status/{wallet}" "GET /pool/state" "POST /admin/init-pool" "POST /admin/approve"; do
    aws apigatewayv2 create-route \
      --api-id "$API_ID" \
      --route-key "$route" \
      --target "integrations/$INTEGRATION_ID" \
      --region "$REGION" >/dev/null
  done
  # Lambda must permit invocation from API Gateway.
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id apigw-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    --region "$REGION" >/dev/null 2>&1 || true
else
  echo "  ✓ $API_NAME exists ($API_ID)"
fi

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"
echo ""
echo "→ Done."
echo ""
echo "  API URL: $API_URL"
echo ""
echo "  Try:"
echo "    curl $API_URL/pool/state"
echo "    curl -X POST $API_URL/kyb/submit -H 'content-type: application/json' \\"
echo "      -d '{\"walletAddress\":\"WALLET\",\"kybData\":{...}}'"
