import { Currency } from 'src/utils/enums/wallet.enum';
import { TagType } from 'src/utils/enums/tag.enum';
export interface JournalInterface {
  currency: Currency;
  amount: number;
  userId: string;
  info: string;
  description: string;
  tag: TagType;
  isReversal?: boolean;
}
