import type { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'pino';
import { WordService } from '../services/word.service';

// Mock Prisma
const mockPrisma = {
  wordIndex: {
    findMany: jest.fn(),
  },
} as unknown as jest.Mocked<PrismaClient>;

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
} as unknown as jest.Mocked<Redis>;

// Mock Logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as jest.Mocked<Logger>;

describe('WordService Load Tests', () => {
  let wordService: WordService;
  const sampleWords = ['hello', 'world', 'test', 'load', 'performance'];
  const sampleArticles = ['1', '2', '3', '4', '5'];

  beforeEach(() => {
    jest.clearAllMocks();
    wordService = new WordService(mockPrisma, mockRedis, mockLogger);
  });

  // Helper to generate random word combinations
  const getRandomWords = (count: number): string[] => {
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      words.push(sampleWords[Math.floor(Math.random() * sampleWords.length)]);
    }
    return [...new Set(words)]; // Remove duplicates
  };

  // Helper to generate mock word index data
  const generateMockWordIndexes = (words: string[]) => {
    return words.flatMap(word => 
      sampleArticles.map(articleId => ({
        articleId,
        word,
        positions: Array.from({ length: Math.floor(Math.random() * 10) + 1 }, 
          () => Math.floor(Math.random() * 1000))
      }))
    );
  };

  describe('findWords Load Test', () => {
    it('should handle high volume of concurrent requests with caching', async () => {
      const requestCount = 100;
      const wordsPerRequest = 3;
      const requests: Promise<any>[] = [];

      console.time('Load Test - Total Time');
      
      // First request to populate cache
      const initialWords = getRandomWords(wordsPerRequest);
      const mockData = generateMockWordIndexes(initialWords);
      (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValueOnce(mockData);
      await wordService.findWords(initialWords);

      // Subsequent requests should hit cache
      for (let i = 0; i < requestCount; i++) {
        const words = getRandomWords(wordsPerRequest);
        const mockData = generateMockWordIndexes(words);
        
        // Simulate cache hits and misses
        if (Math.random() > 0.7) { // 30% cache miss rate
          (mockRedis.get as jest.Mock).mockResolvedValueOnce(null);
          (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValueOnce(mockData);
        } else {
          const cachedResult = words.reduce((acc, word) => {
            acc[word] = mockData
              .filter(index => index.word === word)
              .map(index => ({
                article_id: index.articleId,
                offsets: index.positions,
              }));
            return acc;
          }, {} as Record<string, any[]>);
          
          (mockRedis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedResult));
        }

        requests.push(wordService.findWords(words));
      }

      const results = await Promise.all(requests);
      console.timeEnd('Load Test - Total Time');

      // Verify results
      expect(results).toHaveLength(requestCount);
      
      // Calculate and log metrics
      const cacheHits = (mockRedis.get as jest.Mock).mock.calls.length;
      const cacheMisses = (mockPrisma.wordIndex.findMany as jest.Mock).mock.calls.length;
      
      console.log('Load Test Metrics:');
      console.log(`Total Requests: ${requestCount}`);
      console.log(`Cache Hits: ${cacheHits}`);
      console.log(`Cache Misses: ${cacheMisses}`);
      console.log(`Cache Hit Rate: ${((cacheHits - cacheMisses) / cacheHits * 100).toFixed(2)}%`);
    });

    it('should handle large result sets', async () => {
      const largeWordList = Array.from({ length: 20 }, (_, i) => `word${i}`);
      const largeArticleList = Array.from({ length: 50 }, (_, i) => `article${i}`);
      
      const mockData = largeWordList.flatMap(word => 
        largeArticleList.map(articleId => ({
          articleId,
          word,
          positions: Array.from({ length: 100 }, () => Math.floor(Math.random() * 10000))
        }))
      );

      (mockRedis.get as jest.Mock).mockResolvedValueOnce(null);
      (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValueOnce(mockData);

      console.time('Large Result Set Test');
      const result = await wordService.findWords(largeWordList);
      console.timeEnd('Large Result Set Test');

      expect(Object.keys(result)).toHaveLength(largeWordList.length);
      Object.values(result).forEach(articles => {
        expect(articles).toHaveLength(largeArticleList.length);
      });
    });

    it('should handle concurrent requests with mixed cache states', async () => {
      const concurrentRequests = 50;
      const requests: Promise<any>[] = [];

      console.time('Concurrent Requests Test');
      
      for (let i = 0; i < concurrentRequests; i++) {
        const words = getRandomWords(Math.floor(Math.random() * 5) + 1);
        const mockData = generateMockWordIndexes(words);

        // Simulate mixed cache states
        if (i % 3 === 0) { // Cache miss
          (mockRedis.get as jest.Mock).mockResolvedValueOnce(null);
          (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValueOnce(mockData);
        } else if (i % 3 === 1) { // Cache hit
          const cachedResult = words.reduce((acc, word) => {
            acc[word] = mockData
              .filter(index => index.word === word)
              .map(index => ({
                article_id: index.articleId,
                offsets: index.positions,
              }));
            return acc;
          }, {} as Record<string, any[]>);
          
          (mockRedis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedResult));
        } else { // Redis error
          (mockRedis.get as jest.Mock).mockRejectedValueOnce(new Error('Redis timeout'));
          (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValueOnce(mockData);
        }

        requests.push(wordService.findWords(words));
      }

      const results = await Promise.all(requests);
      console.timeEnd('Concurrent Requests Test');

      expect(results).toHaveLength(concurrentRequests);
    });
  });
}); 