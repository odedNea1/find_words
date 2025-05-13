import Fastify from 'fastify';
import { userRoutes } from '../../routes/users';

describe('User Routes', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    await fastify.register(userRoutes, { prefix: '/users' });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /users', () => {
    it('should return users endpoint message', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/users',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: 'Users endpoint',
      });
    });
  });
}); 