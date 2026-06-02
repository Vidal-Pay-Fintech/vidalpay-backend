import { IsOptional, IsString } from 'class-validator';
import { FxQuoteDto } from './fx-quote.dto';

export class FxConvertDto extends FxQuoteDto {
  @IsString()
  @IsOptional()
  quoteId?: string;
}
