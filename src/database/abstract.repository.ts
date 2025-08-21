import {
  Repository,
  DeepPartial,
  FindOneOptions,
  FindManyOptions,
  IsNull,
} from 'typeorm';
import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AbstractEntity } from './abstract.entity';
import { API_MESSAGES } from 'src/utils/apiMessages';

export abstract class AbstractRepository<T extends AbstractEntity> {
  protected readonly logger: Logger;

  constructor(protected readonly repository: Repository<T>) {
    this.logger = new Logger(repository.metadata.name);
  }

  async create(entity: DeepPartial<T>): Promise<T> {
    try {
      this.logger.log(`Creating entity with data: ${JSON.stringify(entity)}`);
      const createdEntity = this.repository.create(entity);
      const savedEntity = await this.repository.save(createdEntity);
      this.logger.log(
        `Entity created successfully: ${JSON.stringify(savedEntity)}`,
      );
      return savedEntity;
    } catch (error) {
      this.logger.error(`Error saving entity: ${error.message}`, error.stack);
      throw new InternalServerErrorException(API_MESSAGES.SERVER_ERROR);
    }
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    const entity = await this.repository.findOne({
      ...options,
      where: { ...options.where, deletedAt: IsNull() as any }, // Exclude soft-deleted records
    });
    return entity;
  }

  async checkIsExisit(options: FindOneOptions<T>): Promise<T> {
    const entity = await this.findOne(options); // Utilize findOne with soft delete exclusion
    if (!entity) {
      this.logger.warn(
        `Entity not found with options: ${JSON.stringify(options)}`,
      );
      throw new NotFoundException('The entity was not found');
    }
    return entity;
  }

  async findOneAndUpdate(
    id: number | string,
    partialEntity: DeepPartial<T>,
  ): Promise<T> {
    try {
      const existingEntity = await this.repository.findOne({
        where: { id: id as any, deletedAt: IsNull() as any }, // Exclude soft-deleted records
      });

      if (!existingEntity) {
        this.logger.warn(`Entity not found with id: ${id}`);
        throw new NotFoundException('The entity was not found');
      }

      const entity = await this.repository.preload({
        id: id as any,
        ...partialEntity,
      });

      if (!entity) {
        throw new NotFoundException('The entity was not found');
      }

      await this.repository.save(entity);
      return entity;
    } catch (err) {
      this.logger.error(`Error updating entity with id: ${id}`, err.stack);
      throw new InternalServerErrorException(API_MESSAGES.SERVER_ERROR);
    }
  }

  async findOneAndUpdateDeletedRecord(
    id: number | string,
    partialEntity: DeepPartial<T>,
  ): Promise<T> {
    try {
      const existingEntity = await this.repository.findOne({
        where: { id: id as any },
        withDeleted: true,
      });
      console.log(existingEntity, 'isisisiis');
      if (!existingEntity) {
        this.logger.warn(`Entity not found with id: ${id}`);
        throw new NotFoundException('The entity was not found');
      }

      // const entity = await this.repository.preload({
      //   id: id as any,
      //   ...partialEntity,
      // });

      // if (!entity) {
      //   throw new NotFoundException('The entity was not found');
      // }

      return await this.repository.save({
        ...existingEntity,
        ...partialEntity,
      });
    } catch (err) {
      this.logger.error(`Error updating entity with id: ${id}`, err.stack);
      throw new InternalServerErrorException(API_MESSAGES.SERVER_ERROR);
    }
  }

  async find(options: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: { ...options.where, deletedAt: IsNull() as any }, // Exclude soft-deleted records
    });
  }

  async findOneAndDelete(id: number | string): Promise<void> {
    const entity = await this.repository.findOne({ where: { id: id as any } });
    if (!entity) {
      this.logger.warn(`Entity not found with id: ${id}`);
      throw new NotFoundException('The entity was not found');
    }

    // Soft delete by updating the deletedAt column
    entity.deletedAt = new Date();
    await this.repository.save(entity);
    this.logger.log(`Soft-deleted entity with id: ${id}`);
  }

  async findOneAndDeleteFull(id: number | string): Promise<void> {
    const entity = await this.repository.findOne({ where: { id: id as any } });
    if (!entity) {
      this.logger.warn(`Entity not found with id: ${id}`);
      throw new NotFoundException('The entity was not found');
    }
    await this.repository.remove(entity);
    this.logger.log(`Deleted entity with id: ${id}`);
  }

  async removeDeletedRecord(id: number | string): Promise<void> {
    const entity = await this.repository.findOne({
      where: { id: id as any },
      withDeleted: true,
    });
    if (!entity) {
      this.logger.warn(`Entity not found with id: ${id}`);
      throw new NotFoundException('The entity was not found');
    }
    await this.repository.remove(entity);
    this.logger.log(`Deleted entity with id: ${id}`);
  }

  async findAndCount(options: FindManyOptions<T>): Promise<[T[], number]> {
    const [entities, total] = await this.repository.findAndCount({
      ...options,
      where: { ...options.where, deletedAt: IsNull() as any }, // Exclude soft-deleted records
    });
    return [entities, total];
  }
}
