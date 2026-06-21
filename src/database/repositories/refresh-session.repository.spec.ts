import { createHash } from 'crypto';
import { RefreshSessionRepository } from './refresh-session.repository';

describe('RefreshSessionRepository', () => {
  const token = 'signed-refresh-token';
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const createSubject = (session: Record<string, any>) => {
    const transactionalRepository = {
      createQueryBuilder: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const queryBuilder = {
      addSelect: jest.fn(),
      setLock: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getOne: jest.fn().mockResolvedValue(session),
    };
    for (const method of ['addSelect', 'setLock', 'where', 'andWhere']) {
      queryBuilder[method].mockReturnValue(queryBuilder);
    }
    transactionalRepository.createQueryBuilder.mockReturnValue(queryBuilder);

    const manager = {
      getRepository: jest.fn().mockReturnValue(transactionalRepository),
    };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    const outerRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };

    return {
      subject: new RefreshSessionRepository(
        outerRepository as any,
        dataSource as any,
      ),
      transactionalRepository,
    };
  };

  it('atomically revokes the current session and inserts its successor', async () => {
    const { subject, transactionalRepository } = createSubject({
      id: 'current-session',
      userId: 'user-id',
      familyId: 'family-id',
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    const result = await subject.rotate(
      'current-session',
      'user-id',
      'family-id',
      token,
      {
        id: 'next-session',
        userId: 'user-id',
        familyId: 'family-id',
        refreshToken: 'next-signed-refresh-token',
        expiresAt: new Date(Date.now() + 120_000),
      },
    );

    expect(result).toBe('rotated');
    expect(transactionalRepository.update).toHaveBeenCalledWith(
      'current-session',
      expect.objectContaining({
        revokedAt: expect.any(Date),
        replacedBySessionId: 'next-session',
      }),
    );
    expect(transactionalRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'next-session',
        tokenHash: expect.not.stringContaining('next-signed-refresh-token'),
      }),
    );
  });

  it('revokes the entire family when a rotated token is replayed', async () => {
    const { subject, transactionalRepository } = createSubject({
      id: 'current-session',
      userId: 'user-id',
      familyId: 'family-id',
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    const result = await subject.rotate(
      'current-session',
      'user-id',
      'family-id',
      token,
      {
        id: 'attacker-session',
        userId: 'user-id',
        familyId: 'family-id',
        refreshToken: 'unused-token',
        expiresAt: new Date(Date.now() + 120_000),
      },
    );

    expect(result).toBe('reused');
    expect(transactionalRepository.update).toHaveBeenCalledWith(
      { familyId: 'family-id', userId: 'user-id' },
      expect.objectContaining({
        revokedAt: expect.any(Date),
        reuseDetectedAt: expect.any(Date),
      }),
    );
    expect(transactionalRepository.insert).not.toHaveBeenCalled();
  });
});
