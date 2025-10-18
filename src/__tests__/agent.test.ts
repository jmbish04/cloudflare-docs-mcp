import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../d1', () => ({
  listBestPractices: vi.fn(),
  insertTransactionLog: vi.fn(),
  generateEmbedding: vi.fn(),
}));

import { ConsultationAgent } from '../agent';
import { generateEmbedding, insertTransactionLog, listBestPractices } from '../d1';

const listBestPracticesMock = listBestPractices as unknown as ReturnType<typeof vi.fn>;
const insertTransactionLogMock = insertTransactionLog as unknown as ReturnType<typeof vi.fn>;
const generateEmbeddingMock = generateEmbedding as unknown as ReturnType<typeof vi.fn>;

const baseInput = {
  consult_query: 'Why is my Worker timing out?',
  code_string: 'export default { async fetch() { return new Response("ok"); } };',
  metadata: { topK: 4 },
};

describe('ConsultationAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBestPracticesMock.mockResolvedValue([
      { id: 'bp-1', topic: 'Durable Objects', text: 'Use alarms for retries', embedding: [] },
    ]);
    generateEmbeddingMock.mockResolvedValue([0.5, 0.25]);
    insertTransactionLogMock.mockResolvedValue(undefined);
  });

  it('runs a full consultation and captures clarifying questions', async () => {
    const env: AgentEnv = {
      DB: {} as D1Database,
      AI_MODEL: 'cf/meta',
      AI: { run: vi.fn().mockResolvedValue(['Have you enabled logs?']) },
    };
    const agent = new ConsultationAgent(env);

    const searchDocs = vi.fn().mockImplementation(async ({ query, topK }) => {
      expect(query).toBe(baseInput.consult_query);
      expect(topK).toBe(4);
      return {
        results: [
          {
            id: 'doc-1',
            title: 'Worker request lifecycle',
            content: 'Remember to handle fetch events quickly to avoid timeouts.',
            score: 0.91,
          },
        ],
      };
    });

    const response = await agent.runCodeConsultation(baseInput, searchDocs);

    expect(response.query_responses).toHaveLength(2);
    expect(response.query_responses[0].response).toContain('#1 Worker request lifecycle');
    expect(response.consult_overview).toContain('Consultation requested for query');
    expect(response.code_patches).toContain('Best practice hints');
    expect(response.code_fixed).toContain('Suggested patch diff');

    expect(searchDocs).toHaveBeenCalledTimes(1);
    expect(listBestPracticesMock).toHaveBeenCalledTimes(1);
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(2);
    expect(insertTransactionLogMock).toHaveBeenCalledWith(env, expect.any(Object));
  });

  it('gracefully handles missing AI configuration', async () => {
    const env = {
      DB: {} as unknown,
    };
    const agent = new ConsultationAgent(env as any);

    const searchDocs = vi.fn().mockResolvedValue({
      results: [],
    });

    const response = await agent.runCodeConsultation(
      { ...baseInput, metadata: undefined },
      searchDocs
    );

    expect(response.query_responses).toHaveLength(1);
    expect(response.query_responses[0].response).toBe('No documentation snippets returned.');
    expect(listBestPracticesMock).toHaveBeenCalled();
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(2);
    expect(insertTransactionLogMock).toHaveBeenCalled();
  });
});
