// Single Lambda entrypoint. Routes API Gateway HTTP API events to handlers.
//
// Why one Lambda instead of N? At our scale (4 endpoints, low QPS) the
// bundle is tiny (~200KB), cold-start overhead is the same regardless,
// and one zip + one function is the fastest deploy path. If we outgrow
// it, splitting is straightforward — each handler is already isolated.

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { submitKyb, getKybStatus } from "./handlers/kyb";
import { getPoolState } from "./handlers/pool";
import { initPoolHandler, approvePspHandler, listPspsHandler } from "./handlers/admin";

type Route = {
  method: string;
  pattern: RegExp;
  handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;
};

const routes: Route[] = [
  { method: "POST", pattern: /^\/kyb\/submit$/, handler: submitKyb },
  { method: "GET", pattern: /^\/kyb\/status\/[^/]+$/, handler: getKybStatus },
  { method: "GET", pattern: /^\/pool\/state$/, handler: getPoolState },
  { method: "POST", pattern: /^\/admin\/init-pool$/, handler: initPoolHandler },
  { method: "POST", pattern: /^\/admin\/approve$/, handler: approvePspHandler },
  { method: "GET", pattern: /^\/admin\/psps$/, handler: listPspsHandler },
];

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // CORS preflight — needed for mobile app calls from Expo dev origin
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
    };
  }

  const route = routes.find((r) => r.method === method && r.pattern.test(path));
  if (!route) {
    return {
      statusCode: 404,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: `no route for ${method} ${path}` }),
    };
  }

  try {
    const result = await route.handler(event);
    // Layer CORS headers onto every response.
    return {
      ...result,
      headers: { ...corsHeaders(), ...(result.headers ?? {}) },
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
