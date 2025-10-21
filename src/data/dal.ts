import type { D1Database } from '@cloudflare/workers-types';

// --- Table Record Interfaces ---

export interface Doc {
  id: string;
  product: string;
  title: string;
  url: string;
  snippet: string;
  content: string;
  updated_at: number;
}

export type TransactionEventType = string;

export type TransactionStatus = 'SUCCESS' | 'ERROR' | 'PENDING';

export interface Transaction {
  id: number;
  session_id: string;
  timestamp: string;
  event_type: TransactionEventType;
  event_data: string | null;
  status: TransactionStatus;
  error_message: string | null;
  duration_ms: number | null;
}

export interface CuratedKnowledge {
  id: number;
  title: string;
  content: string;
  source_url: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  time_inactive: string | null;
  is_highlighted: boolean;
  time_highlighted: string | null;
}

export interface CuratedKnowledgeSummary {
  id: number;
  title: string;
  tags: string | null;
  is_highlighted: boolean;
}

export type FeasibilityJobStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface FeasibilityJob {
  id: number;
  uuid: string;
  status: FeasibilityJobStatus;
  request_prompt: string;
  final_report: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  time_inactive: string | null;
  is_highlighted: boolean;
  time_highlighted: string | null;
  information_packet_id: number | null;
}

export interface RepositoryAnalysis {
  id: number;
  job_id: number;
  repo_url: string;
  analysis_summary: string;
  frameworks_detected: string | null;
  is_on_workers: boolean | null;
  raw_analysis_data: string | null;
  created_at: string;
}

export interface InformationPacket {
  id: number;
  job_id: number;
  content: string;
  version: number;
  created_at: string;
}

export interface PacketHighlight {
  id: number;
  packet_id: number;
  section_identifier: string;
  user_comment: string | null;
  is_active: boolean;
  created_at: string;
}

export type HealthStatus = 'PASS' | 'FAIL';

export interface HealthCheck {
  id: number;
  timestamp: string;
  overall_status: HealthStatus;
  results_data: string;
}

// --- Data Access Layer ---

export class DataAccessLayer {
  constructor(private readonly db: D1Database) {}

  // Generic helpers
  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value !== '0' && value.toLowerCase() !== 'false';
    return Boolean(value);
  }

  private toNullableBoolean(value: unknown): boolean | null {
    if (value === null || value === undefined) return null;
    return this.toBoolean(value);
  }

  private mapDoc(row: any): Doc {
    return {
      id: row.id,
      product: row.product,
      title: row.title,
      url: row.url,
      snippet: row.snippet,
      content: row.content,
      updated_at: Number(row.updated_at),
    };
  }

  private mapTransaction(row: any): Transaction {
    return {
      id: row.id,
      session_id: row.session_id,
      timestamp: row.timestamp,
      event_type: row.event_type,
      event_data: row.event_data ?? null,
      status: row.status,
      error_message: row.error_message ?? null,
      duration_ms: row.duration_ms ?? null,
    };
  }

  private mapCuratedKnowledge(row: any): CuratedKnowledge {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      source_url: row.source_url ?? null,
      tags: row.tags ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: this.toBoolean(row.is_active ?? true),
      time_inactive: row.time_inactive ?? null,
      is_highlighted: this.toBoolean(row.is_highlighted ?? false),
      time_highlighted: row.time_highlighted ?? null,
    };
  }

  private mapFeasibilityJob(row: any): FeasibilityJob {
    return {
      id: row.id,
      uuid: row.uuid,
      status: row.status,
      request_prompt: row.request_prompt,
      final_report: row.final_report ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: this.toBoolean(row.is_active ?? true),
      time_inactive: row.time_inactive ?? null,
      is_highlighted: this.toBoolean(row.is_highlighted ?? false),
      time_highlighted: row.time_highlighted ?? null,
      information_packet_id: row.information_packet_id ?? null,
    };
  }

  private mapRepositoryAnalysis(row: any): RepositoryAnalysis {
    return {
      id: row.id,
      job_id: row.job_id,
      repo_url: row.repo_url,
      analysis_summary: row.analysis_summary,
      frameworks_detected: row.frameworks_detected ?? null,
      is_on_workers: this.toNullableBoolean(row.is_on_workers),
      raw_analysis_data: row.raw_analysis_data ?? null,
      created_at: row.created_at,
    };
  }

  private mapInformationPacket(row: any): InformationPacket {
    return {
      id: row.id,
      job_id: row.job_id,
      content: row.content,
      version: row.version,
      created_at: row.created_at,
    };
  }

  private mapPacketHighlight(row: any): PacketHighlight {
    return {
      id: row.id,
      packet_id: row.packet_id,
      section_identifier: row.section_identifier,
      user_comment: row.user_comment ?? null,
      is_active: this.toBoolean(row.is_active ?? true),
      created_at: row.created_at,
    };
  }

  private mapHealthCheck(row: any): HealthCheck {
    return {
      id: row.id,
      timestamp: row.timestamp,
      overall_status: row.overall_status,
      results_data: row.results_data,
    };
  }

  private resolveIdentifier(identifier: string | number): { column: 'id' | 'uuid'; value: string | number } {
    if (typeof identifier === 'number') {
      return { column: 'id', value: identifier };
    }

    const numeric = Number(identifier);
    if (!Number.isNaN(numeric) && identifier.trim() === numeric.toString()) {
      return { column: 'id', value: numeric };
    }

    return { column: 'uuid', value: identifier };
  }

  // --- General Utilities ---

  async ping(): Promise<void> {
    await this.db.prepare('SELECT 1').run();
  }

  // --- Docs ---

  async getDoc(id: string): Promise<Doc | null> {
    const row = await this.db.prepare('SELECT * FROM docs WHERE id = ?').bind(id).first();
    return row ? this.mapDoc(row) : null;
  }

  async upsertDoc(doc: Doc): Promise<Doc> {
    const stmt = this.db.prepare(
      `INSERT INTO docs (id, product, title, url, snippet, content, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         product = excluded.product,
         title = excluded.title,
         url = excluded.url,
         snippet = excluded.snippet,
         content = excluded.content,
         updated_at = excluded.updated_at
       RETURNING *`
    );
    const result = await stmt
      .bind(doc.id, doc.product, doc.title, doc.url, doc.snippet, doc.content, doc.updated_at)
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to upsert doc');
    return this.mapDoc(row);
  }

  async deleteDoc(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM docs WHERE id = ?').bind(id).run();
  }

  // --- Transactions ---

  async createTransaction(entry: Omit<Transaction, 'id' | 'timestamp'> & { timestamp?: string }): Promise<Transaction> {
    const stmt = this.db.prepare(
      `INSERT INTO transactions (session_id, timestamp, event_type, event_data, status, error_message, duration_ms)
       VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?) RETURNING *`
    );
    const result = await stmt
      .bind(
        entry.session_id,
        entry.timestamp ?? null,
        entry.event_type,
        entry.event_data ?? null,
        entry.status,
        entry.error_message ?? null,
        entry.duration_ms ?? null
      )
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to create transaction');
    return this.mapTransaction(row);
  }

  async listTransactionsForSession(sessionId: string): Promise<Transaction[]> {
    const result = await this.db
      .prepare('SELECT * FROM transactions WHERE session_id = ? ORDER BY timestamp DESC')
      .bind(sessionId)
      .all();
    return (result.results ?? []).map((row) => this.mapTransaction(row));
  }

  async deleteTransactionsForSession(sessionId: string): Promise<void> {
    await this.db.prepare('DELETE FROM transactions WHERE session_id = ?').bind(sessionId).run();
  }

  // --- Curated Knowledge ---

  async listActiveCuratedKnowledgeSummaries(): Promise<CuratedKnowledgeSummary[]> {
    const result = await this.db
      .prepare('SELECT id, title, tags, is_highlighted FROM curated_knowledge WHERE is_active = TRUE')
      .all();
    return (result.results ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: Number(record.id),
        title: String(record.title ?? ''),
        tags: typeof record.tags === 'string' ? record.tags : record.tags == null ? null : String(record.tags),
        is_highlighted: this.toBoolean((record.is_highlighted as unknown) ?? false),
      } satisfies CuratedKnowledgeSummary;
    });
  }

  async createCuratedKnowledge(entry: {
    title: string;
    content: string;
    source_url?: string | null;
    tags?: string | null;
  }): Promise<CuratedKnowledge> {
    const stmt = this.db.prepare(
      `INSERT INTO curated_knowledge (title, content, source_url, tags)
       VALUES (?, ?, ?, ?)
       RETURNING *`
    );
    const result = await stmt
      .bind(entry.title, entry.content, entry.source_url ?? null, entry.tags ?? null)
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to create curated knowledge entry');
    return this.mapCuratedKnowledge(row);
  }

  async setCuratedKnowledgeHighlight(id: number, highlighted: boolean, timestamp: string | null): Promise<void> {
    await this.db
      .prepare('UPDATE curated_knowledge SET is_highlighted = ?, time_highlighted = ? WHERE id = ?')
      .bind(highlighted ? 1 : 0, timestamp, id)
      .run();
  }

  async getCuratedKnowledge(id: number): Promise<CuratedKnowledge | null> {
    const row = await this.db.prepare('SELECT * FROM curated_knowledge WHERE id = ?').bind(id).first();
    return row ? this.mapCuratedKnowledge(row) : null;
  }

  async getCuratedKnowledgeByIds(ids: number[]): Promise<CuratedKnowledge[]> {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const stmt = this.db.prepare(`SELECT * FROM curated_knowledge WHERE id IN (${placeholders})`);
    const result = await stmt.bind(...ids).all();
    return (result.results ?? []).map((row) => this.mapCuratedKnowledge(row));
  }

  async updateCuratedKnowledge(id: number, updates: Partial<Omit<CuratedKnowledge, 'id'>>): Promise<CuratedKnowledge | null> {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (fields.length === 0) {
      return this.getCuratedKnowledge(id);
    }
    const stmt = this.db.prepare(`UPDATE curated_knowledge SET ${fields.join(', ')} WHERE id = ? RETURNING *`);
    const result = await stmt.bind(...values, id).all();
    const row = result.results?.[0];
    return row ? this.mapCuratedKnowledge(row) : null;
  }

  async searchCuratedKnowledge(query: string): Promise<CuratedKnowledge[]> {
    const like = `%${query}%`;
    const result = await this.db
      .prepare('SELECT * FROM curated_knowledge WHERE content LIKE ? OR tags LIKE ?')
      .bind(like, like)
      .all();
    return (result.results ?? []).map((row) => this.mapCuratedKnowledge(row));
  }

  // --- Feasibility Jobs ---

  async createFeasibilityJob(prompt: string, uuid: string, status: FeasibilityJobStatus = 'QUEUED'): Promise<FeasibilityJob> {
    const result = await this.db
      .prepare(
        `INSERT INTO feasibility_jobs (uuid, request_prompt, status)
         VALUES (?, ?, ?) RETURNING *`
      )
      .bind(uuid, prompt, status)
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to create feasibility job');
    return this.mapFeasibilityJob(row);
  }

  async getFeasibilityJob(identifier: string | number): Promise<FeasibilityJob | null> {
    const { column, value } = this.resolveIdentifier(identifier);
    const row = await this.db
      .prepare(`SELECT * FROM feasibility_jobs WHERE ${column} = ?`)
      .bind(value)
      .first();
    return row ? this.mapFeasibilityJob(row) : null;
  }

  async listFeasibilityJobs(options: {
    status?: FeasibilityJobStatus;
    query?: string;
    sortDirection?: 'ASC' | 'DESC';
  }): Promise<FeasibilityJob[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.query) {
      conditions.push('request_prompt LIKE ?');
      params.push(`%${options.query}%`);
    }
    let sql = 'SELECT * FROM feasibility_jobs';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY created_at ${options.sortDirection === 'ASC' ? 'ASC' : 'DESC'}`;
    const result = await this.db.prepare(sql).bind(...params).all();
    return (result.results ?? []).map((row) => this.mapFeasibilityJob(row));
  }

  async updateFeasibilityJobStatus(id: number, status: FeasibilityJobStatus): Promise<void> {
    await this.db
      .prepare('UPDATE feasibility_jobs SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(status, id)
      .run();
  }

  async attachInformationPacket(jobId: number, packetId: number): Promise<void> {
    await this.db
      .prepare('UPDATE feasibility_jobs SET information_packet_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(packetId, jobId)
      .run();
  }

  // --- Repository Analysis ---

  async addRepositoryAnalysis(entry: Omit<RepositoryAnalysis, 'id' | 'created_at'>): Promise<RepositoryAnalysis> {
    const result = await this.db
      .prepare(
        `INSERT INTO repository_analysis (job_id, repo_url, analysis_summary, frameworks_detected, is_on_workers, raw_analysis_data)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .bind(
        entry.job_id,
        entry.repo_url,
        entry.analysis_summary,
        entry.frameworks_detected ?? null,
        entry.is_on_workers ?? null,
        entry.raw_analysis_data ?? null
      )
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to create repository analysis');
    return this.mapRepositoryAnalysis(row);
  }

  async listRepositoryAnalysisForJob(jobId: number): Promise<RepositoryAnalysis[]> {
    const result = await this.db
      .prepare('SELECT * FROM repository_analysis WHERE job_id = ? ORDER BY created_at ASC')
      .bind(jobId)
      .all();
    return (result.results ?? []).map((row) => this.mapRepositoryAnalysis(row));
  }

  async deleteRepositoryAnalysis(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM repository_analysis WHERE id = ?').bind(id).run();
  }

  // --- Information Packets ---

  async createInformationPacket(entry: Omit<InformationPacket, 'id' | 'created_at'>): Promise<InformationPacket> {
    const result = await this.db
      .prepare(
        `INSERT INTO information_packets (job_id, content, version)
         VALUES (?, ?, ?) RETURNING *`
      )
      .bind(entry.job_id, entry.content, entry.version)
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to create information packet');
    return this.mapInformationPacket(row);
  }

  async getInformationPacketByJob(jobId: number): Promise<InformationPacket | null> {
    const row = await this.db
      .prepare('SELECT * FROM information_packets WHERE job_id = ?')
      .bind(jobId)
      .first();
    return row ? this.mapInformationPacket(row) : null;
  }

  // --- Packet Highlights ---

  async listActivePacketHighlights(packetId: number): Promise<PacketHighlight[]> {
    const result = await this.db
      .prepare('SELECT * FROM packet_highlights WHERE packet_id = ? AND is_active = TRUE')
      .bind(packetId)
      .all();
    return (result.results ?? []).map((row) => this.mapPacketHighlight(row));
  }

  async addPacketHighlight(entry: Omit<PacketHighlight, 'id' | 'created_at'>): Promise<PacketHighlight> {
    const result = await this.db
      .prepare(
        `INSERT INTO packet_highlights (packet_id, section_identifier, user_comment, is_active)
         VALUES (?, ?, ?, ?) RETURNING *`
      )
      .bind(entry.packet_id, entry.section_identifier, entry.user_comment ?? null, entry.is_active ? 1 : 0)
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to create packet highlight');
    return this.mapPacketHighlight(row);
  }

  // --- Health Checks ---

  async logHealthCheck(status: HealthStatus, results: unknown): Promise<HealthCheck> {
    const payload = typeof results === 'string' ? results : JSON.stringify(results);
    const result = await this.db
      .prepare(
        `INSERT INTO health_checks (overall_status, results_data)
         VALUES (?, ?) RETURNING *`
      )
      .bind(status, payload)
      .all();
    const row = result.results?.[0];
    if (!row) throw new Error('Failed to log health check');
    return this.mapHealthCheck(row);
  }

  async getLatestHealthCheck(): Promise<HealthCheck | null> {
    const row = await this.db
      .prepare('SELECT * FROM health_checks ORDER BY timestamp DESC LIMIT 1')
      .first();
    return row ? this.mapHealthCheck(row) : null;
  }
}
