import { Controller, Get, Param } from '@nestjs/common';
import { LegalService } from './legal.service';

@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('overview')
  getOverview() {
    return this.legalService.getOverview();
  }

  @Get('documents')
  getDocuments() {
    return this.legalService.getDocuments();
  }

  @Get('documents/:slug')
  getDocument(@Param('slug') slug: string) {
    return this.legalService.getDocument(slug);
  }
}
