import type { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'pino';
import { WordService } from '../services/word.service';

// Mock Prisma
const mockPrisma = {
  wordIndex: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  wordArticleCount: {
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(mockPrisma)),
} as unknown as jest.Mocked<PrismaClient>;

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
} as unknown as jest.Mocked<Redis>;

// Mock Logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as jest.Mocked<Logger>;

// Type for word index result
interface WordIndexResult {
  articleId: string;
  word: string;
  positions: number[];
}

describe('WordService', () => {
  let wordService: WordService;

  beforeEach(() => {
    jest.clearAllMocks();
    wordService = new WordService(mockPrisma, mockRedis, mockLogger);
  });

  describe('findWords', () => {
    it('should return cached results if available', async () => {
      const cachedResult = {
        hello: [{ article_id: '1', offsets: [0, 12] }],
      };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResult));

      const result = await wordService.findWords(['hello']);
      expect(result).toEqual(cachedResult);
      expect(mockRedis.get).toHaveBeenCalledWith('find-words:hello');
      expect(mockPrisma.wordIndex.findMany).not.toHaveBeenCalled();
    });

    it('should query database and cache results if not cached', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValue([
        {
          articleId: '1',
          word: 'hello',
          positions: [0, 12],
        } as WordIndexResult,
      ]);

      const result = await wordService.findWords(['hello']);
      expect(result).toEqual({
        hello: [{ article_id: '1', offsets: [0, 12] }],
      });
      expect(mockPrisma.wordIndex.findMany).toHaveBeenCalledWith({
        where: {
          word: {
            in: ['hello'],
          },
        },
        include: {
          article: true,
        },
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'find-words:hello',
        expect.any(String),
        'EX',
        600
      );
    });

    it('should handle multiple words correctly', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValue([
        {
          articleId: '1',
          word: 'hello',
          positions: [0, 12],
        } as WordIndexResult,
        {
          articleId: '1',
          word: 'world',
          positions: [6],
        } as WordIndexResult,
      ]);

      const result = await wordService.findWords(['hello', 'world']);
      expect(result).toEqual({
        hello: [{ article_id: '1', offsets: [0, 12] }],
        world: [{ article_id: '1', offsets: [6] }],
      });
    });

    it('should handle case-insensitive search', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValue([
        {
          articleId: '1',
          word: 'hello',
          positions: [0, 12],
        } as WordIndexResult,
      ]);

      const result = await wordService.findWords(['HELLO']);
      expect(result).toEqual({
        hello: [{ article_id: '1', offsets: [0, 12] }],
      });
    });

    it('should handle Redis errors gracefully', async () => {
      (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis error'));
      (mockPrisma.wordIndex.findMany as jest.Mock).mockResolvedValue([
        {
          articleId: '1',
          word: 'hello',
          positions: [0, 12],
        } as WordIndexResult,
      ]);

      const result = await wordService.findWords(['hello']);
      expect(result).toEqual({
        hello: [{ article_id: '1', offsets: [0, 12] }],
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getMostCommonWordArticle', () => {
    it('should return the article with most occurrences of the word', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wordArticleCount.findFirst as jest.Mock).mockResolvedValue({
        articleId: '1',
        word: 'hello',
        count: 5,
      });

      const result = await wordService.getMostCommonWordArticle('hello');
      expect(result).toEqual({
        article_id: '1',
        count: 5,
      });
      expect(mockPrisma.wordArticleCount.findFirst).toHaveBeenCalledWith({
        where: {
          word: 'hello',
        },
        orderBy: {
          count: 'desc',
        },
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'most-common-word:hello',
        expect.any(String),
        'EX',
        600
      );
    });

    it('should return null if word not found', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wordArticleCount.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await wordService.getMostCommonWordArticle('nonexistent');
      expect(result).toBeNull();
    });

    it('should return cached result if available', async () => {
      const cachedResult = {
        article_id: '1',
        count: 5,
      };
      (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResult));

      const result = await wordService.getMostCommonWordArticle('hello');
      expect(result).toEqual(cachedResult);
      expect(mockPrisma.wordArticleCount.findFirst).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wordArticleCount.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(wordService.getMostCommonWordArticle('hello')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('processArticle', () => {
    it('should process and index words correctly', async () => {
      const articleId = '1';
      const content = 'Hello world! Hello again.';

      await wordService.processArticle(articleId, content);

      expect(mockPrisma.wordIndex.deleteMany).toHaveBeenCalledWith({
        where: { articleId },
      });
      expect(mockPrisma.wordArticleCount.deleteMany).toHaveBeenCalledWith({
        where: { articleId },
      });

      expect(mockPrisma.wordIndex.create).toHaveBeenCalledTimes(3);
      expect(mockPrisma.wordArticleCount.create).toHaveBeenCalledTimes(3);

      // Verify cache invalidation
      expect(mockRedis.del).toHaveBeenCalledWith('top-words:*');
      expect(mockRedis.del).toHaveBeenCalledWith('most-common-word:hello');
      expect(mockRedis.del).toHaveBeenCalledWith('most-common-word:world');
      expect(mockRedis.del).toHaveBeenCalledWith('most-common-word:again');
    });

    it('should handle empty content', async () => {
      const articleId = '1';
      const content = '';

      await wordService.processArticle(articleId, content);

      expect(mockPrisma.wordIndex.deleteMany).toHaveBeenCalledWith({
        where: { articleId },
      });
      expect(mockPrisma.wordArticleCount.deleteMany).toHaveBeenCalledWith({
        where: { articleId },
      });
      expect(mockPrisma.wordIndex.create).not.toHaveBeenCalled();
      expect(mockPrisma.wordArticleCount.create).not.toHaveBeenCalled();
    });

    it('should handle content with only punctuation', async () => {
      const articleId = '1';
      const content = '!@#$%^&*()';

      await wordService.processArticle(articleId, content);

      expect(mockPrisma.wordIndex.deleteMany).toHaveBeenCalledWith({
        where: { articleId },
      });
      expect(mockPrisma.wordArticleCount.deleteMany).toHaveBeenCalledWith({
        where: { articleId },
      });
      expect(mockPrisma.wordIndex.create).not.toHaveBeenCalled();
      expect(mockPrisma.wordArticleCount.create).not.toHaveBeenCalled();
    });

    it('should handle transaction errors', async () => {
      const articleId = '1';
      const content = 'Hello world';

      const error = new Error('Transaction failed');
      mockPrisma.$transaction.mockRejectedValueOnce(error);

      await expect(wordService.processArticle(articleId, content)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
}); 