import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../index';
import { redis } from '../index';
import { WordService } from '../services/word.service';
import logger from './logger';

const wordService = new WordService(prisma, redis, logger);

export const wordRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /find-words
  fastify.post('/find-words', {
    schema: {
      body: {
        type: 'object',
        required: ['words'],
        properties: {
          words: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { words } = request.body as { words: string[] };
      const results = await wordService.findWords(words);
      return reply.send(results);
    },
  });

  // GET /most-common-word
  fastify.get('/most-common-word', {
    schema: {
      querystring: {
        type: 'object',
        required: ['word'],
        properties: {
          word: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { word } = request.query as { word: string };
      const result = await wordService.getMostCommonWordArticle(word);
      return reply.send(result);
    },
  });
}; 