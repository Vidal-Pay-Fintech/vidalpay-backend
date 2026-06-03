import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API metadata', () => {
      expect(appController.getHello()).toMatchObject({
        service: 'vidalpay-backend',
        status: 'ok',
        apiBasePath: '/api/v1',
        health: '/api/v1/health',
        readiness: '/api/v1/ready',
      });
    });
  });
});
