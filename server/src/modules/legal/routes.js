import { readFile } from 'node:fs/promises';

const documents = {
  '/user-agreement': new URL('../../../legal/user-agreement.html', import.meta.url),
  '/user-agreement.html': new URL('../../../legal/user-agreement.html', import.meta.url),
  '/privacy-policy': new URL('../../../legal/privacy-policy.html', import.meta.url),
  '/privacy-policy.html': new URL('../../../legal/privacy-policy.html', import.meta.url)
};

export default async function legalRoutes(app) {
  for (const [path, url] of Object.entries(documents)) {
    app.get(path, async (_request, reply) => {
      const html = await readFile(url, 'utf8');
      return reply
        .header('cache-control', 'public, max-age=300')
        .type('text/html; charset=utf-8')
        .send(html);
    });
  }
}
