import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'backend',
  });
});

// Hello endpoint
app.get('/api/hello', (c) => {
  const name = c.req.query('name') || 'World';
  return c.json({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'GCP GitHub Actions - Backend',
    version: '1.0.0',
    endpoints: [
      { path: '/health', description: 'Health check' },
      { path: '/api/hello', description: 'Hello World (accepts ?name=X)' },
    ],
  });
});

const port = parseInt(process.env.PORT || '3000');

console.log(`Server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
// Test: backend-only change for smart deployment validation
