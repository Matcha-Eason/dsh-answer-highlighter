/** Connection Fetch route for the browser annotation list. */

import { ANNOTATION_LIST_PATH } from './protocol.js'

/**
 * Create the exact GET route served by DSH Connection.
 *
 * The route accepts only `sessionId`. Service failures return an opaque 500
 * response so browser users do not receive host error details.
 *
 * @param {object} service - annotation service.
 * @param {object} [logger] - host logger.
 * @returns {{path: string, methods: string[], requestBody: 'buffered', fetch: (request: Request) => Promise<Response>}} route.
 */
export function createAnnotationListRoute(service, logger = console) {
  return {
    path: ANNOTATION_LIST_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const sessionId = new URL(request.url).searchParams.get('sessionId')
      if (sessionId === null || sessionId.length === 0) {
        return Response.json({ error: 'missing sessionId' }, {
          status: 400,
          headers: { 'cache-control': 'no-store' },
        })
      }

      try {
        const { items } = await service.list({ sessionId })
        return Response.json({ items }, {
          headers: { 'cache-control': 'no-store' },
        })
      } catch (error) {
        logger?.warn?.('answer-highlight: annotation list failed', error)
        return Response.json({ error: 'annotation list failed' }, {
          status: 500,
          headers: { 'cache-control': 'no-store' },
        })
      }
    },
  }
}
