import { FastifyPluginAsync } from 'fastify';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /users
  fastify.get('/', {
    handler: async (request, reply) => {
      return reply.send({ message: 'Users endpoint' });
    },
  });
}; 