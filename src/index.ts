import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { articleRoutes } from './routes/articles';
import { userRoutes } from './routes/users';
import { commentRoutes } from './routes/comments';
import { wordRoutes } from './routes/words';

const server = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Initialize Prisma Client
export const prisma = new PrismaClient();

// Initialize Redis Client
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Register plugins
server.register(cors);
server.register(fastifySwagger, {
  swagger: {
    info: {
      title: 'My API',
      description: 'API documentation',
      version: '1.0.0',
    },
    schemes: ['http', 'https'],
  },
});

// Register routes
server.register(articleRoutes, { prefix: '/articles' });
server.register(userRoutes, { prefix: '/users' });
server.register(commentRoutes, { prefix: '/comments' });
server.register(wordRoutes, { prefix: '/words' });

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    server.log.info(`Server listening on ${server.server.address()}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  await server.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

start(); 