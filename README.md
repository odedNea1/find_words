# Find Words Backend Service

A production-ready Node.js backend service with TypeScript for efficient word finding and analysis in articles.

## Features

- Word finding with character offsets across articles
- Most common word analysis
- Article management with automatic word indexing
- Redis caching for improved performance
- PostgreSQL database with Prisma ORM
- Docker Compose setup for easy deployment

## Tech Stack

- Node.js with TypeScript
- Fastify web framework
- PostgreSQL database
- Prisma ORM
- Redis for caching
- Docker & Docker Compose
- Jest for testing

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Running the Application

1. Clone the repository
2. Start the services:
   ```bash
   docker-compose up
   ```

The application will be available at http://localhost:3000

### Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run database migrations:
   ```bash
   npm run migrate
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Word Operations

- `POST /find-words`
  - Input: `{ "words": ["word1", "word2"] }`
  - Returns character offsets of words in articles

- `GET /most-common-word?word=example`
  - Returns the article where the word appears most frequently

- `GET /top-words?limit=10`
  - Returns the top N most common words across all articles

### Article Operations

- `POST /articles`
  - Create a new article
  - Input: `{ "author": "string", "content": "string" }`

- `GET /articles/:id`
  - Get article by ID

## Design Decisions and Tradeoffs

1. **PostgreSQL vs Elasticsearch**
   - Since fast responses are required, both DBs would require preprocessing and indexing.
   - Chose PostgreSQL for simplicity and transaction support.
   - ElasticSearch would be more suitable if we were to introduce other word-matching features that don't require pre-computation.

2. **Redis Caching**
   - 10-minute TTL for cache entries
   - Cache invalidation on article updates
   - Improves response times for frequent queries

3. **Word Processing**
   - Case-insensitive matching
   - Whole-word matching using word boundaries
   - Preprocessed word indexes for faster queries

4. **Performance Optimizations**
   - Indexed word_index and word_article_count table
   - Batch processing for word statistics
   - Efficient caching strategy

Known Issues:
Error [ERR_REQUIRE_ESM]: require() of ES Module for p-retry
It means the p-retry library has switched to ESM-only and cannot be used with require() inside CommonJS modules.

## Testing

Run the test suite:
```bash
npm test
```

## Production Deployment

1. Configure environment variables:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `NODE_ENV`

2. Build and run:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

## Monitoring and Logging

- Built-in Fastify logging
- Ready for Prometheus/Grafana integration
- Health check endpoint at `/health`

## Future Improvements

1. Add full-text search capabilities
2. Implement rate limiting
3. Add metrics collection
4. Implement user authentication
5. Add API documentation with Swagger/OpenAPI 