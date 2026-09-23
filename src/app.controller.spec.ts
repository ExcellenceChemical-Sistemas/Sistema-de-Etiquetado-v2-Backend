import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const queryRaw = jest.fn();

  beforeEach(async () => {
    queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('salud', () => {
    it('200 cuando la base contesta', async () => {
      queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      await expect(appController.salud()).resolves.toEqual({ ok: true, db: true });
    });

    it('503 cuando la base no contesta (el servidor solo no alcanza para estar "sano")', async () => {
      queryRaw.mockRejectedValueOnce(new Error('conexión caída'));
      await expect(appController.salud()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
