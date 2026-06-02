import { Test, TestingModule } from '@nestjs/testing';
import { HashingService } from './hashing.service';

class TestHashingService extends HashingService {
  async hash(data: string | Buffer): Promise<string> {
    return `hashed:${data.toString()}`;
  }

  async compare(data: string | Buffer, encrypted: string): Promise<boolean> {
    return encrypted === (await this.hash(data));
  }
}

describe('HashingService', () => {
  let service: HashingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [{ provide: HashingService, useClass: TestHashingService }],
    }).compile();

    service = module.get<HashingService>(HashingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
