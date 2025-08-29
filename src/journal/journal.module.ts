import { Global, Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';

@Global()
@Module({
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
