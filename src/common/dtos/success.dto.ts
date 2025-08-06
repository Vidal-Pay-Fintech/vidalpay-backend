export class SuccessResponseDto {
    constructor(
      public code: string,
      public status: boolean,
      public message: string,
      public data?: any | any[] | Record<string, any>,
    ) {}
  }