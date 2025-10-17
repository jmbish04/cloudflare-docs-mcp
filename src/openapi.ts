import { OpenAPIHono } from '@hono/zod-openapi';

export const OPENAPI_PATH = '/openapi.json';

export function configureOpenAPIRoute(app: OpenAPIHono<any>) {
  const info = {
    title: 'Cloudflare Worker MCP API',
    version: '0.1.0',
    description:
      'Scaffolded Worker providing MCP endpoints, AI-assisted consultation, and OpenAPI 3.1 schema.',
  };

  app.doc31(OPENAPI_PATH, {
    info,
    openapi: '3.1.0',
    servers: [{ url: 'https://example.com', description: 'TODO: replace with deployment origin.' }],
  });

  app.get(OPENAPI_PATH, (c) => {
    const baseDoc = app.getOpenAPI31Document({
      info,
      openapi: '3.1.0',
      servers: [{ url: deriveServerUrl(c.req.url), description: 'Derived from request URL.' }],
    });

    const patched = enforceOpenAPISpec(baseDoc);
    return c.json(patched);
  });

  app.get('/openapi', (c) => c.redirect(OPENAPI_PATH));
}

function deriveServerUrl(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'https://example.com';
  }
}

function enforceOpenAPISpec<T extends { openapi?: string; paths?: Record<string, unknown> }>(document: T): T {
  const patched = { ...document, openapi: '3.1.0' } as T;
  if (patched.paths) {
    patched.paths = Object.fromEntries(
      Object.entries(patched.paths).map(([path, value]) => {
        const normalizedPath = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        return [normalizedPath, value];
      })
    );
  }
  return patched;
}
