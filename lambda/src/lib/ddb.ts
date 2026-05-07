// DynamoDB DocumentClient wrapper. Uses on-demand billing — no idle cost.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION ?? "us-east-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

export const Tables = {
  Users: process.env.DDB_USERS ?? "PayMate_Users",
  KybSubmissions: process.env.DDB_KYB ?? "PayMate_KybSubmissions",
  AgentCallLog: process.env.DDB_AGENT_LOG ?? "PayMate_AgentCallLog",
} as const;

export async function putItem<T extends Record<string, unknown>>(
  table: string,
  item: T,
): Promise<void> {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
}

export async function getItem<T>(
  table: string,
  key: Record<string, unknown>,
): Promise<T | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: table, Key: key }));
  return r.Item as T | undefined;
}

export async function scanAll<T>(table: string): Promise<T[]> {
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: lastKey }),
    );
    items.push(...((r.Items ?? []) as T[]));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function queryByPartition<T>(
  table: string,
  pk: string,
  pkValue: unknown,
  options?: { limit?: number; descending?: boolean },
): Promise<T[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": pk },
      ExpressionAttributeValues: { ":pk": pkValue },
      Limit: options?.limit,
      ScanIndexForward: !options?.descending,
    }),
  );
  return (r.Items ?? []) as T[];
}
