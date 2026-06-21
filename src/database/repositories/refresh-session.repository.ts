import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { DataSource, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { RefreshSession } from '../entities/refresh-session.entity';

export interface NewRefreshSession {
  id: string;
  userId: string;
  familyId: string;
  refreshToken: string;
  expiresAt: Date;
  deviceId?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export type RefreshRotationResult =
  | 'rotated'
  | 'invalid'
  | 'expired'
  | 'reused';

@Injectable()
export class RefreshSessionRepository {
  private readonly logger = new Logger(RefreshSessionRepository.name);

  constructor(
    @InjectRepository(RefreshSession)
    private readonly repository: Repository<RefreshSession>,
    private readonly dataSource: DataSource,
  ) {}

  async createSession(session: NewRefreshSession): Promise<void> {
    await this.repository.insert(this.toRecord(session));
  }

  async rotate(
    currentSessionId: string,
    userId: string,
    familyId: string,
    presentedToken: string,
    replacement: NewRefreshSession,
  ): Promise<RefreshRotationResult> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RefreshSession);
      const current = await repository
        .createQueryBuilder('session')
        .addSelect(['session.tokenHash', 'session.userAgent'])
        .setLock('pessimistic_write')
        .where('session.id = :currentSessionId', { currentSessionId })
        .andWhere('session.deletedAt IS NULL')
        .getOne();

      if (
        !current ||
        current.userId !== userId ||
        current.familyId !== familyId ||
        !this.hashMatches(presentedToken, current.tokenHash)
      ) {
        return 'invalid';
      }

      const now = new Date();
      if (current.revokedAt) {
        await repository.update(
          { familyId, userId },
          { revokedAt: now, reuseDetectedAt: now },
        );
        this.logger.warn(
          `Refresh token reuse detected for user ${userId}, family ${familyId}`,
        );
        return 'reused';
      }

      if (current.expiresAt.getTime() <= now.getTime()) {
        await repository.update(current.id, { revokedAt: now });
        return 'expired';
      }

      await repository.update(current.id, {
        revokedAt: now,
        replacedBySessionId: replacement.id,
      });
      await repository.insert({
        ...this.toRecord({
          ...replacement,
          deviceId: replacement.deviceId ?? current.deviceId,
          deviceName: replacement.deviceName ?? current.deviceName,
          userAgent: replacement.userAgent ?? current.userAgent,
          ipAddress: replacement.ipAddress ?? current.ipAddress,
        }),
        lastRefreshedAt: now,
      });
      return 'rotated';
    });
  }

  async revokePresentedToken(
    sessionId: string,
    userId: string,
    familyId: string,
    presentedToken: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RefreshSession);
      const session = await repository
        .createQueryBuilder('session')
        .addSelect('session.tokenHash')
        .setLock('pessimistic_write')
        .where('session.id = :sessionId', { sessionId })
        .andWhere('session.deletedAt IS NULL')
        .getOne();

      if (
        !session ||
        session.userId !== userId ||
        session.familyId !== familyId ||
        !this.hashMatches(presentedToken, session.tokenHash)
      ) {
        return false;
      }

      const now = new Date();
      if (session.revokedAt) {
        await repository.update(
          { familyId, userId },
          { revokedAt: now, reuseDetectedAt: now },
        );
      } else {
        await repository.update(session.id, { revokedAt: now });
      }

      return true;
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async listActiveForUser(userId: string): Promise<RefreshSession[]> {
    return this.repository
      .createQueryBuilder('session')
      .addSelect('session.userAgent')
      .where('session.userId = :userId', { userId })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now: new Date() })
      .andWhere('session.deletedAt IS NULL')
      .orderBy('session.lastSeenAt', 'DESC')
      .getMany();
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.repository.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session) return false;
    const now = new Date();
    if (now.getTime() - session.lastSeenAt.getTime() >= 60_000) {
      await this.repository.update(session.id, { lastSeenAt: now });
    }
    return true;
  }

  async revokeFamilyForUser(userId: string, familyId: string) {
    const result = await this.repository.update(
      { userId, familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return Boolean(result.affected);
  }

  async revokeAllExceptFamily(userId: string, familyId: string) {
    const result = await this.repository.update(
      { userId, familyId: Not(familyId), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  private toRecord(session: NewRefreshSession) {
    return {
      id: session.id,
      userId: session.userId,
      familyId: session.familyId,
      tokenHash: this.hashToken(session.refreshToken),
      expiresAt: session.expiresAt,
      revokedAt: null,
      reuseDetectedAt: null,
      replacedBySessionId: null,
      deviceId: session.deviceId ?? null,
      deviceName: session.deviceName ?? null,
      userAgent: session.userAgent?.slice(0, 500) ?? null,
      ipAddress: session.ipAddress?.slice(0, 64) ?? null,
      lastSeenAt: new Date(),
      lastRefreshedAt: null,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashMatches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashToken(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
