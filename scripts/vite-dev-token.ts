// LOCAL DEV ONLY: a Vite plugin that serves the developer's own Hugging Face token to the
// dev page at /__dev/hf-token, because OAuth cannot complete on localhost.
//
// `apply: 'serve'` means the plugin does not exist during `vite build`, and nothing in
// the app imports it; scripts/deploy-space.ts refuses to upload a build that contains the
// route. The route answers only requests addressed to a loopback host, so a rebinding
// page on another domain cannot read the token.

import type { Plugin } from 'vite';
import { readHfToken } from '../eval/lib/token';

export const DEV_TOKEN_ROUTE = '/__dev/hf-token';

export function devHfToken(): Plugin {
  return {
    name: 'receipts-dev-hf-token',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(DEV_TOKEN_ROUTE, (request, response) => {
        const host = (request.headers.host ?? '').replace(/:\d+$/, '');
        if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
          response.statusCode = 403;
          response.end('local development only');
          return;
        }
        try {
          response.setHeader('content-type', 'text/plain');
          response.setHeader('cache-control', 'no-store');
          response.end(readHfToken());
        } catch {
          response.statusCode = 404;
          response.end('no token');
        }
      });
    },
  };
}
