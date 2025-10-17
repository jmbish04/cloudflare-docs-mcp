import { createRoute, z } from '@hono/zod-openapi';

export const ErrorSchema = z.object({
  error: z.string().openapi({ example: 'Invalid request payload' }),
  details: z.record(z.any()).optional(),
});

export const SearchDocsRequestSchema = z
  .object({
    query: z
      .string()
      .min(1, 'Query must not be empty')
      .openapi({ example: 'How to configure wrangler.toml?' }),
    topK: z
      .number()
      .int()
      .positive()
      .max(10)
      .default(3)
      .openapi({ example: 3 }),
  })
  .openapi({
    description: 'Parameters used to retrieve Cloudflare documentation snippets.',
  });

export const SearchDocsResponseSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string().openapi({ example: 'doc-123' }),
        title: z.string().openapi({ example: 'Wrangler configuration' }),
        content: z.string().openapi({ example: 'Use wrangler.toml to configure...' }),
        score: z.number().openapi({ example: 0.87 }),
        url: z.string().url().optional(),
      })
    )
    .openapi({ description: 'Search hits ranked by similarity.' }),
});

export const CodeConsultationRequestSchema = z
  .object({
    consult_query: z
      .string()
      .min(1)
      .openapi({ example: 'How do I fix my Worker throwing 500 errors?' }),
    code_string: z
      .string()
      .min(1)
      .openapi({ example: "export default { async fetch() { /*...*/ } };" }),
    metadata: z.record(z.any()).optional(),
  })
  .openapi({ description: 'Code consultation input that blends natural language with code.' });

export const CodeConsultationResponseSchema = z.object({
  query_responses: z
    .array(
      z.object({
        query: z.string(),
        response: z.string(),
      })
    )
    .openapi({ description: 'Responses to intermediate search or clarifying queries.' }),
  consult_overview: z.string().openapi({ description: 'High level summary of the recommendations.' }),
  code_patches: z
    .string()
    .openapi({ description: 'Diff-style patch suggestions (unified diff format recommended).' }),
  code_fixed: z
    .string()
    .openapi({ description: 'Complete code with patches applied.' }),
});

export const MCPToolListResponseSchema = z.object({
  tools: z.array(
    z.object({
      name: z.enum(['search_docs', 'code_consultation']),
      description: z.string(),
      input_schema: z.any(),
    })
  ),
});

export const MCPToolCallRequestSchema = z.object({
  name: z.enum(['search_docs', 'code_consultation']),
  arguments: z.unknown(),
});

export const MCPToolCallResponseSchema = z.object({
  name: z.enum(['search_docs', 'code_consultation']),
  response: z.unknown(),
});

export type SearchDocsRequest = z.infer<typeof SearchDocsRequestSchema>;
export type SearchDocsResponse = z.infer<typeof SearchDocsResponseSchema>;
export type CodeConsultationRequest = z.infer<typeof CodeConsultationRequestSchema>;
export type CodeConsultationResponse = z.infer<typeof CodeConsultationResponseSchema>;

export const searchDocsRoute = createRoute({
  method: 'post',
  path: '/api/searchDocs',
  operationId: 'searchDocs',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SearchDocsRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Search result payload.',
      content: {
        'application/json': {
          schema: SearchDocsResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error.',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});

export const codeConsultationRoute = createRoute({
  method: 'post',
  path: '/api/codeConsultation',
  operationId: 'codeConsultation',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CodeConsultationRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Consultation output with suggested fixes.',
      content: {
        'application/json': {
          schema: CodeConsultationResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error.',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  },
});
