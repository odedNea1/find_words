import Fastify from 'fastify';
import { commentRoutes } from '../../routes/comments';

describe('Comment Routes', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    await fastify.register(commentRoutes, { prefix: '/comments' });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /comments', () => {
    it('should return comments endpoint message', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/comments',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'Comments endpoint',
      });
    });
  });
}); 