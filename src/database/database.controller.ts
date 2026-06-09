import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { DatabaseService } from './database.service';
import { CreateDatabaseDto } from './dto/create-database.dto';
import { UpdateDatabaseDto } from './dto/update-database.dto';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
@Controller('database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Post()
  create(@Body() createDatabaseDto: CreateDatabaseDto) {
    return this.databaseService.create(createDatabaseDto);
  }

  @Get()
  findAll() {
    return this.databaseService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.databaseService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDatabaseDto: UpdateDatabaseDto,
  ) {
    return this.databaseService.update(+id, updateDatabaseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.databaseService.remove(+id);
  }
}
