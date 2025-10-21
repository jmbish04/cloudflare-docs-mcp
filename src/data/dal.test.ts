import { describe, it, expect } from 'vitest';
import { DataAccessLayer, type FeasibilityJob } from './dal';

type Method = 'all' | 'first' | 'run';
interface RecordedCall { sql: string; params: unknown[]; method: Method; }

type Handler = (sql: string, params: unknown[], method: Method) => Promise<any>;

function createMockD1(handler: Handler) {
  const recorded: RecordedCall[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            all() {
              recorded.push({ sql, params, method: 'all' });
              return handler(sql, params, 'all');
            },
            first() {
              recorded.push({ sql, params, method: 'first' });
              return handler(sql, params, 'first');
            },
            run() {
              recorded.push({ sql, params, method: 'run' });
              return handler(sql, params, 'run');
            },
          };
        },
        all() {
          recorded.push({ sql, params: [], method: 'all' });
          return handler(sql, [], 'all');
        },
        first() {
          recorded.push({ sql, params: [], method: 'first' });
          return handler(sql, [], 'first');
        },
        run() {
          recorded.push({ sql, params: [], method: 'run' });
          return handler(sql, [], 'run');
        },
      };
    },
  } as any;
  return { db, recorded };
}

describe('DataAccessLayer', () => {
  it('creates feasibility job with proper parameters', async () => {
    const row = {
      id: 1,
      uuid: 'job-1',
      status: 'QUEUED',
      request_prompt: 'Analyze repo',
      final_report: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      is_active: 1,
      time_inactive: null,
      is_highlighted: 0,
      time_highlighted: null,
      information_packet_id: null,
    } satisfies Partial<FeasibilityJob>;

    const { db, recorded } = createMockD1(async (sql, params, method) => {
      if (method === 'all') {
        return { results: [row] };
      }
      throw new Error(`Unexpected method ${method}`);
    });

    const dal = new DataAccessLayer(db);
    const created = await dal.createFeasibilityJob('Analyze repo', 'job-1');

    expect(recorded[0]?.sql).toContain('INSERT INTO feasibility_jobs');
    expect(recorded[0]?.params).toEqual(['job-1', 'Analyze repo', 'QUEUED']);
    expect(created).toEqual({
      id: 1,
      uuid: 'job-1',
      status: 'QUEUED',
      request_prompt: 'Analyze repo',
      final_report: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      is_active: true,
      time_inactive: null,
      is_highlighted: false,
      time_highlighted: null,
      information_packet_id: null,
    });
  });

  it('retrieves feasibility job by uuid and maps booleans', async () => {
    const row = {
      id: 5,
      uuid: 'job-5',
      status: 'COMPLETED',
      request_prompt: 'Analyze repo',
      final_report: 'done',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      is_active: 0,
      time_inactive: '2024-01-02T00:00:00Z',
      is_highlighted: 1,
      time_highlighted: '2024-01-02T00:00:00Z',
      information_packet_id: 7,
    } satisfies Partial<FeasibilityJob>;

    const { db, recorded } = createMockD1(async (sql, params, method) => {
      if (method === 'first') {
        return row;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    const dal = new DataAccessLayer(db);
    const job = await dal.getFeasibilityJob('job-5');

    expect(recorded[0]?.sql).toContain('SELECT * FROM feasibility_jobs WHERE uuid = ?');
    expect(recorded[0]?.params).toEqual(['job-5']);
    expect(job).toEqual({
      id: 5,
      uuid: 'job-5',
      status: 'COMPLETED',
      request_prompt: 'Analyze repo',
      final_report: 'done',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      is_active: false,
      time_inactive: '2024-01-02T00:00:00Z',
      is_highlighted: true,
      time_highlighted: '2024-01-02T00:00:00Z',
      information_packet_id: 7,
    });
  });

  it('returns null when feasibility job is missing', async () => {
    const { db } = createMockD1(async () => null);
    const dal = new DataAccessLayer(db);
    const job = await dal.getFeasibilityJob(99);
    expect(job).toBeNull();
  });
});
