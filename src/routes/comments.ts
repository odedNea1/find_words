import { FastifyPluginAsync } from 'fastify';

export const commentRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /comments
  fastify.get('/', {
    handler: async (request, reply) => {
      return reply.send({ message: 'Comments endpoint' });
    },
  });
}; 