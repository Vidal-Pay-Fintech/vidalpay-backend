import { PageMetaDtoParameters } from './pageMetaDtoParameters.dto';

export class PageMetaDto {
  readonly currentPage: number;
  readonly length: number;
  readonly totalVolume: number;
  readonly totalPages: number;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  9;
  readonly pendingDraws: number;
  readonly completedDraws: number;
  readonly ongoingDraws: number;
  readonly cancelledDraws: number;

  constructor({ pageOptionsDto, itemCount }: PageMetaDtoParameters) {
    this.currentPage = pageOptionsDto.page || 1;
    this.length = pageOptionsDto.limit || 50;
    this.totalVolume = itemCount;
    this.totalPages = Math.ceil(this.totalVolume / this.length);
    this.hasPreviousPage = this.currentPage > 1;
    this.hasNextPage = this.currentPage < this.totalPages;
  }
}
