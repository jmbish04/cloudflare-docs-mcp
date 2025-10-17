export interface D1Env {
  DB: D1Database;
}

export interface BestPracticeRow {
  id: string;
  topic: string;
  text: string;
  embedding: number[];
}

export interface TransactionLogRow {
  id: string;
  timestamp: string;
  request_payload: unknown;
  response_payload: unknown;
  request_embedding: number[];
  response_embedding: number[];
}

export async function insertBestPractice(env: D1Env, entry: Omit<BestPracticeRow, 'id'> & { id?: string }) {
  const id = entry.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO best_practices (id, topic, text, embedding) VALUES (?1, ?2, ?3, ?4)`
  )
    .bind(id, entry.topic, entry.text, JSON.stringify(entry.embedding))
    .run();
  return { ...entry, id };
}

export async function listBestPractices(env: D1Env): Promise<BestPracticeRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, topic, text, embedding FROM best_practices`
  ).all<{ id: string; topic: string; text: string; embedding: string }>();

  return (results ?? []).map((row) => ({
    id: row.id,
    topic: row.topic,
    text: row.text,
    embedding: parseEmbedding(row.embedding),
  }));
}

export async function insertTransactionLog(
  env: D1Env,
  entry: Omit<TransactionLogRow, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
) {
  const id = entry.id ?? crypto.randomUUID();
  const timestamp = entry.timestamp ?? new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO transaction_log (id, timestamp, request_payload, response_payload, request_embedding, response_embedding)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(
      id,
      timestamp,
      JSON.stringify(entry.request_payload),
      JSON.stringify(entry.response_payload),
      JSON.stringify(entry.request_embedding),
      JSON.stringify(entry.response_embedding)
    )
    .run();

  return { ...entry, id, timestamp };
}

export async function generateEmbedding(
  env: { AI?: { run: (model: string, input: unknown) => Promise<unknown> }; AI_MODEL?: string },
  text: string
): Promise<number[]> {
  // TODO: plug in actual embedding generation via Cloudflare AI once model + prompt are defined.
  if (env.AI && env.AI_MODEL) {
    try {
      const raw = await env.AI.run(env.AI_MODEL, {
        prompt: `Return a JSON array embedding for: ${text}`,
      });
      if (Array.isArray(raw)) {
        return raw as number[];
      }
      if (typeof raw === 'object' && raw !== null && 'embedding' in raw && Array.isArray((raw as any).embedding)) {
        return (raw as any).embedding as number[];
      }
    } catch (error) {
      console.warn('Embedding generation failed, falling back to zero vector.', error);
    }
  }

  return new Array(16).fill(0); // TODO: align embedding dimensionality with the selected model.
}

function parseEmbedding(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as number[]) : [];
  } catch (error) {
    console.warn('Failed to parse embedding payload from D1.', error);
    return [];
  }
}
