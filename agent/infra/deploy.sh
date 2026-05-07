#!/usr/bin/env bash
# PayMate Agent deploy. Idempotent — safe to re-run.
#
# Provisions: 2 Lambda functions (risk + compliance agents),
# 2 API Gateway routes on the existing paymate-http-api.
#
# Reuses the existing paymate-lambda-exec IAM role (already has Bedrock + DDB perms).
# Loads agent keys from lambda/.secrets/agent-keys.json.
#
# Requires `aws configure` already done. Region from env or us-east-1.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ROLE_NAME="paymate-lambda-exec"
RISK_FUNCTION="paymate-risk-agent"
COMPLIANCE_FUNCTION="paymate-compliance-agent"
API_NAME="paymate-http-api"
BEDROCK_MODEL_ID="us.anthropic.claude-haiku-4-5-20251001-v1:0"

cd "$(dirname "$0")/.."   # agent/

echo "→ Region: $REGION"
echo "→ AWS account: $(aws sts get-caller-identity --query Account --output text)"

# -----------------------------------------------------------------------------
# 0. Load agent keys
# -----------------------------------------------------------------------------

KEYS_FILE="../lambda/.secrets/agent-keys.json"
if [ ! -f "$KEYS_FILE" ]; then
  echo "ERROR: $KEYS_FILE not found. Run lambda/infra/gen-keys.ts first."
  exit 1
fi

# Extract keys (requires jq)
RISK_WALLET=$(jq -r '."risk-agent".address' "$KEYS_FILE")
RISK_PK=$(jq -r '."risk-agent".privateKey' "$KEYS_FILE")
COMPLIANCE_WALLET=$(jq -r '."compliance-agent".address' "$KEYS_FILE")
COMPLIANCE_PK=$(jq -r '."compliance-agent".privateKey' "$KEYS_FILE")

echo "→ Risk agent wallet: $RISK_WALLET"
echo "→ Compliance agent wallet: $COMPLIANCE_WALLET"

# -----------------------------------------------------------------------------
# 1. Get IAM role ARN
# -----------------------------------------------------------------------------

echo ""
echo "→ IAM exec role"
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text 2>/dev/null || echo "")

if [ -z "$ROLE_ARN" ]; then
  echo "  ERROR: $ROLE_NAME does not exist. Run lambda/infra/deploy.sh first."
  exit 1
fi
echo "  ✓ $ROLE_NAME ($ROLE_ARN)"

# -----------------------------------------------------------------------------
# 2. Build and package
# -----------------------------------------------------------------------------

echo ""
echo "→ Building agent bundles"
bun run package
echo "  ✓ dist/risk.zip + dist/compliance.zip"

# -----------------------------------------------------------------------------
# 3. Deploy Compliance Lambda (first, so we can get its URL for Risk)
# -----------------------------------------------------------------------------

echo ""
echo "→ Compliance Lambda"
if aws lambda get-function --function-name "$COMPLIANCE_FUNCTION" --region "$REGION" >/dev/null 2>&1; then
  echo "  + updating $COMPLIANCE_FUNCTION"
  aws lambda update-function-code \
    --function-name "$COMPLIANCE_FUNCTION" \
    --zip-file fileb://dist/compliance.zip \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated \
    --function-name "$COMPLIANCE_FUNCTION" \
    --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$COMPLIANCE_FUNCTION" \
    --environment "Variables={AGENT_WALLET_ADDRESS=$COMPLIANCE_WALLET,AGENT_PRIVATE_KEY=$COMPLIANCE_PK}" \
    --region "$REGION" >/dev/null
else
  echo "  + creating $COMPLIANCE_FUNCTION"
  aws lambda create-function \
    --function-name "$COMPLIANCE_FUNCTION" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file fileb://dist/compliance.zip \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={AGENT_WALLET_ADDRESS=$COMPLIANCE_WALLET,AGENT_PRIVATE_KEY=$COMPLIANCE_PK}" \
    --region "$REGION" >/dev/null
  aws lambda wait function-active \
    --function-name "$COMPLIANCE_FUNCTION" \
    --region "$REGION"
fi
COMPLIANCE_ARN=$(aws lambda get-function \
  --function-name "$COMPLIANCE_FUNCTION" \
  --query Configuration.FunctionArn \
  --output text --region "$REGION")
echo "  ✓ $COMPLIANCE_ARN"

# -----------------------------------------------------------------------------
# 4. Get API Gateway ID + build compliance URL
# -----------------------------------------------------------------------------

echo ""
echo "→ HTTP API Gateway"
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" --output text)

if [ -z "$API_ID" ]; then
  echo "  ERROR: $API_NAME not found. Run lambda/infra/deploy.sh first."
  exit 1
fi
echo "  ✓ $API_NAME ($API_ID)"

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"
COMPLIANCE_URL="${API_URL}/agent/compliance"

# -----------------------------------------------------------------------------
# 5. Deploy Risk Lambda
# -----------------------------------------------------------------------------

echo ""
echo "→ Risk Lambda"
if aws lambda get-function --function-name "$RISK_FUNCTION" --region "$REGION" >/dev/null 2>&1; then
  echo "  + updating $RISK_FUNCTION"
  aws lambda update-function-code \
    --function-name "$RISK_FUNCTION" \
    --zip-file fileb://dist/risk.zip \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated \
    --function-name "$RISK_FUNCTION" \
    --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$RISK_FUNCTION" \
    --environment "Variables={AGENT_WALLET_ADDRESS=$RISK_WALLET,AGENT_PRIVATE_KEY=$RISK_PK,COMPLIANCE_AGENT_URL=$COMPLIANCE_URL,BEDROCK_MODEL_ID=$BEDROCK_MODEL_ID}" \
    --region "$REGION" >/dev/null
else
  echo "  + creating $RISK_FUNCTION"
  aws lambda create-function \
    --function-name "$RISK_FUNCTION" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file fileb://dist/risk.zip \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={AGENT_WALLET_ADDRESS=$RISK_WALLET,AGENT_PRIVATE_KEY=$RISK_PK,COMPLIANCE_AGENT_URL=$COMPLIANCE_URL,BEDROCK_MODEL_ID=$BEDROCK_MODEL_ID}" \
    --region "$REGION" >/dev/null
  aws lambda wait function-active \
    --function-name "$RISK_FUNCTION" \
    --region "$REGION"
fi
RISK_ARN=$(aws lambda get-function \
  --function-name "$RISK_FUNCTION" \
  --query Configuration.FunctionArn \
  --output text --region "$REGION")
echo "  ✓ $RISK_ARN"

# -----------------------------------------------------------------------------
# 6. Add API Gateway routes
# -----------------------------------------------------------------------------

echo ""
echo "→ API Gateway routes"

# Get or create integrations for each Lambda
add_route() {
  local function_name=$1
  local function_arn=$2
  local route_key=$3

  # Check if route already exists
  EXISTING=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" \
    --query "Items[?RouteKey=='$route_key'].RouteId" --output text)

  if [ -n "$EXISTING" ]; then
    echo "  ✓ $route_key already exists"
    return
  fi

  # Create integration
  INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id "$API_ID" \
    --integration-type AWS_PROXY \
    --integration-uri "$function_arn" \
    --payload-format-version "2.0" \
    --region "$REGION" \
    --query IntegrationId --output text)

  # Create route
  aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "$route_key" \
    --target "integrations/$INTEGRATION_ID" \
    --region "$REGION" >/dev/null

  # Grant API Gateway permission to invoke Lambda
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  aws lambda add-permission \
    --function-name "$function_name" \
    --statement-id "apigw-invoke-$(echo "$route_key" | tr ' /' '-')" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" \
    --region "$REGION" >/dev/null 2>&1 || true

  echo "  + $route_key → $function_name"
}

add_route "$RISK_FUNCTION" "$RISK_ARN" "POST /agent/risk"
add_route "$COMPLIANCE_FUNCTION" "$COMPLIANCE_ARN" "POST /agent/compliance"

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------

echo ""
echo "→ Done."
echo ""
echo "  API URL: $API_URL"
echo ""
echo "  Endpoints:"
echo "    POST $API_URL/agent/risk         (Risk Agent — x402 gated)"
echo "    POST $API_URL/agent/compliance   (Compliance Agent — x402 gated)"
echo ""
echo "  Test (will return 402 price quote):"
echo "    curl -X POST $API_URL/agent/risk -H 'content-type: application/json' \\"
echo "      -d '{\"companyName\":\"Test Corp\",\"jurisdiction\":\"GB\",\"yearsInOperation\":5,\"businessType\":\"PSP\",\"monthlyTransactionVolume\":500000,\"annualRevenue\":5000000,\"amlPolicyInPlace\":true,\"primaryCorridor\":\"GB-NG\"}'"
