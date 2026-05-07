#!/usr/bin/env bash
# Tear down PayMate Agent Lambdas and API Gateway routes.
# Does NOT delete the API Gateway itself (shared with orchestrator)
# or the IAM role (shared with lambda/).

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
RISK_FUNCTION="paymate-risk-agent"
COMPLIANCE_FUNCTION="paymate-compliance-agent"
API_NAME="paymate-http-api"

echo "→ Region: $REGION"

# -----------------------------------------------------------------------------
# 1. Remove API Gateway routes
# -----------------------------------------------------------------------------

echo ""
echo "→ API Gateway routes"
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" --output text)

if [ -n "$API_ID" ]; then
  for route_key in "POST /agent/risk" "POST /agent/compliance"; do
    ROUTE_ID=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" \
      --query "Items[?RouteKey=='$route_key'].RouteId" --output text)
    if [ -n "$ROUTE_ID" ]; then
      aws apigatewayv2 delete-route --api-id "$API_ID" --route-id "$ROUTE_ID" --region "$REGION"
      echo "  ✓ deleted route: $route_key"
    else
      echo "  - route not found: $route_key"
    fi
  done

  # Clean up integrations for agent Lambdas
  for integration_id in $(aws apigatewayv2 get-integrations --api-id "$API_ID" --region "$REGION" \
    --query "Items[?contains(IntegrationUri, 'paymate-risk-agent') || contains(IntegrationUri, 'paymate-compliance-agent')].IntegrationId" --output text); do
    aws apigatewayv2 delete-integration --api-id "$API_ID" --integration-id "$integration_id" --region "$REGION" 2>/dev/null || true
    echo "  ✓ deleted integration: $integration_id"
  done
else
  echo "  - API Gateway not found"
fi

# -----------------------------------------------------------------------------
# 2. Delete Lambda functions
# -----------------------------------------------------------------------------

echo ""
echo "→ Lambda functions"

for fn in "$RISK_FUNCTION" "$COMPLIANCE_FUNCTION"; do
  if aws lambda get-function --function-name "$fn" --region "$REGION" >/dev/null 2>&1; then
    aws lambda delete-function --function-name "$fn" --region "$REGION"
    echo "  ✓ deleted $fn"
  else
    echo "  - $fn not found"
  fi
done

echo ""
echo "→ Done. (IAM role and API Gateway preserved — shared with orchestrator)"
