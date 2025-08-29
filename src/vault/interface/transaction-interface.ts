import { TransactionType } from 'src/utils/enums/transaction-type.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { TagType } from 'src/utils/enums/tag.enum';
export interface TransactionInterface {
  currency: Currency;
  amount: number;
  userId: string;
  info: string;
  description: string;
  reference: string;
  tag: TagType;
}
