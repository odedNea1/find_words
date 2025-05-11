import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../index';
import { WordService } from '../services/word.service';
import { redis } from '../index';

const wordService = new WordService(prisma, redis);

export const articleRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /articles
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['author', 'content'],
        properties: {
          author: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { author, content } = request.body as { author: string; content: string };
      
      const article = await prisma.article.create({
        data: {
          author,
          content,
        },
      });

      // Process the article content for word indexing
      await wordService.processArticle(article.id, content);

      return reply.send(article);
    },
  });

  // GET /articles/:id
  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const article = await prisma.article.findUnique({
        where: { id },
        include: {
          comments: true,
        },
      });

      if (!article) {
        return reply.status(404).send({ error: 'Article not found' });
      }

      return reply.send(article);
    },
  });
}; 