#!/usr/bin/env bash
# Tear down PayMate AWS resources. Use only when you want to start fresh.
# Will NOT delete data backups or anything outside the resources we created.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ROLE_NAME="paymate-lambda-exec"
FUNCTION_NAME="paymate-api"
API_NAME="paymate-http-api"

echo "→ HTTP API"
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" --output text)
if [ -n "$API_ID" ]; then
  aws apigatewayv2 delete-api --api-id "$API_ID" --region "$REGION"
  echo "  ✓ deleted $API_NAME ($API_ID)"
else
  echo "  - none"
fi

echo "→ Lambda"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda delete-function --function-name "$FUNCTION_NAME" --region "$REGION"
  echo "  ✓ deleted $FUNCTION_NAME"
else
  echo "  - none"
fi

echo "→ IAM role"
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  for policy in \
    arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
    arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess \
    arn:aws:iam::aws:policy/AmazonBedrockFullAccess; do
    aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn "$policy" 2>/dev/null || true
  done
  aws iam delete-role --role-name "$ROLE_NAME"
  echo "  ✓ deleted $ROLE_NAME"
else
  echo "  - none"
fi

echo "→ DynamoDB tables (data WILL be deleted)"
for t in PayMate_Users PayMate_KybSubmissions PayMate_AgentCallLog; do
  if aws dynamodb describe-table --table-name "$t" --region "$REGION" >/dev/null 2>&1; then
    aws dynamodb delete-table --table-name "$t" --region "$REGION" >/dev/null
    echo "  ✓ deleted $t"
  fi
done
