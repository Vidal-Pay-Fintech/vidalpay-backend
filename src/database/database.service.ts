import { Injectable, NotImplementedException } from '@nestjs/common';
import { CreateDatabaseDto } from './dto/create-database.dto';
import { UpdateDatabaseDto } from './dto/update-database.dto';

@Injectable()
export class DatabaseService {
  create(createDatabaseDto: CreateDatabaseDto) {
    throw new NotImplementedException(
      'Database scaffold route is disabled and is not a public product API.',
    );
  }

  findAll() {
    throw new NotImplementedException(
      'Database scaffold route is disabled and is not a public product API.',
    );
  }

  findOne(id: number) {
    throw new NotImplementedException(
      'Database scaffold route is disabled and is not a public product API.',
    );
  }

  update(id: number, updateDatabaseDto: UpdateDatabaseDto) {
    throw new NotImplementedException(
      'Database scaffold route is disabled and is not a public product API.',
    );
  }

  remove(id: number) {
    throw new NotImplementedException(
      'Database scaffold route is disabled and is not a public product API.',
    );
  }
}
