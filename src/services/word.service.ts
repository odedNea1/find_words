import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Logger } from 'pino';
const pRetry = require('p-retry');

interface WordIndex {
  articleId: string;
  word: string;
  positions: number[];
}

interface WordArticleCount {
  word: string;
  articleId: string;
  count: number;
}

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export class WordService {
  private readonly retryOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 5000,
  };

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private logger: Logger
  ) {}

  private async getCachedResult(cacheKey: string): Promise<any | null> {
    try {
      const cached = await pRetry(
        async () => {
          const result = await this.redis.get(cacheKey);
          return result ? JSON.parse(result) : null;
        },
        this.retryOptions
      );
      return cached;
    } catch (error) {
      this.logger.warn({ error, cacheKey }, 'Failed to get cached result after retries');
      return null;
    }
  }

  private async setCachedResult(cacheKey: string, data: any): Promise<void> {
    try {
      await pRetry(
        async () => {
          await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 600);
        },
        this.retryOptions
      );
    } catch (error) {
      this.logger.warn({ error, cacheKey }, 'Failed to set cached result after retries');
    }
  }

  async findWords(words: string[]): Promise<Record<string, Array<{ article_id: string, offsets: number[] }>>> {
    try {
      const cacheKey = `find-words:${words.sort().join(',')}`;
      
      // Try to get from cache first
      const cached = await this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

      // Normalize words to lowercase for case-insensitive search
      const normalizedWords = words.map(word => word.toLowerCase());

      // Query the word_index table for all words at once
      const wordIndexes = await pRetry(
        async () => {
          return this.prisma.wordIndex.findMany({
            where: {
              word: {
                in: normalizedWords,
              },
            },
            include: {
              article: true,
            },
          });
        },
        this.retryOptions
      );

      // Format the results
      const results: Record<string, Array<{ article_id: string, offsets: number[] }>> = {};
      
      for (const word of normalizedWords) {
        results[word] = wordIndexes
          .filter((index: WordIndex) => index.word === word)
          .map((index: WordIndex) => ({
            article_id: index.articleId,
            offsets: index.positions,
          }));
      }

      // Cache the results
      await this.setCachedResult(cacheKey, results);

      return results;
    } catch (error) {
      this.logger.error({ error, words }, 'Error in findWords');
      throw error;
    }
  }

  async getMostCommonWordArticle(word: string): Promise<{ article_id: string, count: number } | null> {
    try {
      const cacheKey = `most-common-word:${word.toLowerCase()}`;
      
      // Try to get from cache first
      const cached = await this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

      // Query the word_article_count table
      const mostCommon = await pRetry(
        async () => {
          return this.prisma.wordArticleCount.findFirst({
            where: {
              word: word.toLowerCase(),
            },
            orderBy: {
              count: 'desc',
            },
          });
        },
        this.retryOptions
      );

      if (!mostCommon) {
        return null;
      }

      const result = {
        article_id: mostCommon.articleId,
        count: mostCommon.count,
      };

      // Cache the result
      await this.setCachedResult(cacheKey, result);

      return result;
    } catch (error) {
      this.logger.error({ error, word }, 'Error in getMostCommonWordArticle');
      throw error;
    }
  }

  async processArticle(articleId: string, content: string): Promise<void> {
    try {
      // Split content into words and get their positions
      const words = content.toLowerCase().split(/\b/);
      const wordPositions: Record<string, number[]> = {};
      let position = 0;

      for (const word of words) {
        if (/^\w+$/.test(word)) { // Only process actual words, not whitespace or punctuation
          if (!wordPositions[word]) {
            wordPositions[word] = [];
          }
          wordPositions[word].push(position);
        }
        position += word.length;
      }

      // Start a transaction to update word indexes and stats
      await pRetry(
        async () => {
          await this.prisma.$transaction(async (tx: TransactionClient) => {
            // Delete existing word indexes and counts for this article
            await tx.wordIndex.deleteMany({
              where: { articleId },
            });
            await tx.wordArticleCount.deleteMany({
              where: { articleId },
            });

            // Create new word indexes and update counts
            for (const [word, positions] of Object.entries(wordPositions)) {
              await tx.wordIndex.create({
                data: {
                  articleId,
                  word,
                  positions,
                },
              });

              // Update word article count
              await tx.wordArticleCount.create({
                data: {
                  articleId,
                  word,
                  count: positions.length,
                },
              });              
            }
          });
        },
        this.retryOptions
      );

      // Invalidate relevant caches
      await Promise.allSettled([
        this.redis.del('top-words:*'),
        ...Object.keys(wordPositions).map(word => 
          this.redis.del(`most-common-word:${word}`))
      ]);
    } catch (error) {
      this.logger.error({ error, articleId }, 'Error in processArticle');
      throw error;
    }
  }
} 