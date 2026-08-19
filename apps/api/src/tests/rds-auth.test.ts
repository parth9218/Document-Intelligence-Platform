import { Signer } from '@aws-sdk/rds-signer';
import { getRdsIamAuthToken, clearRdsTokenCache } from '../utils/rds-auth';

jest.mock('@aws-sdk/rds-signer');

describe('RDS IAM Authentication Token Utility', () => {
  let mockGetAuthToken: jest.Mock;

  beforeEach(() => {
    clearRdsTokenCache();
    jest.clearAllMocks();

    mockGetAuthToken = jest.fn().mockImplementation(async () => {
      return 'https://rds-db.example.com:5432/?Action=connect&DBUser=iam_user&X-Amz-Algorithm=AWS4-HMAC-SHA256';
    });

    (Signer as jest.MockedClass<typeof Signer>).mockImplementation((opts: any) => {
      return {
        getAuthToken: mockGetAuthToken,
      } as any;
    });
  });

  it('should generate an IAM DB auth token with custom options', async () => {
    const token = await getRdsIamAuthToken({
      hostname: 'rds-db.example.com',
      port: 5432,
      username: 'iam_user',
      region: 'us-east-1',
    });

    expect(token).toContain('rds-db.example.com');
    expect(token).toContain('DBUser=iam_user');
    expect(token).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(mockGetAuthToken).toHaveBeenCalledTimes(1);
  });

  it('should cache generated tokens to prevent redundant signer invocations', async () => {
    const token1 = await getRdsIamAuthToken({
      hostname: 'rds-db.example.com',
      port: 5432,
      username: 'iam_user',
      region: 'us-east-1',
    });

    const token2 = await getRdsIamAuthToken({
      hostname: 'rds-db.example.com',
      port: 5432,
      username: 'iam_user',
      region: 'us-east-1',
    });

    expect(token1).toEqual(token2);
    // Signer constructor and getAuthToken should only have been called once due to caching
    expect(Signer).toHaveBeenCalledTimes(1);
    expect(mockGetAuthToken).toHaveBeenCalledTimes(1);
  });

  it('should generate a new token after cache is cleared', async () => {
    await getRdsIamAuthToken({
      hostname: 'rds-db.example.com',
      port: 5432,
      username: 'iam_user',
      region: 'us-east-1',
    });

    clearRdsTokenCache();

    await getRdsIamAuthToken({
      hostname: 'rds-db.example.com',
      port: 5432,
      username: 'iam_user',
      region: 'us-east-1',
    });

    expect(Signer).toHaveBeenCalledTimes(2);
    expect(mockGetAuthToken).toHaveBeenCalledTimes(2);
  });
});

describe('Database Connection Pool with RDS IAM Auth', () => {
  it('should export valid pgPool and prisma instances', () => {
    const { pgPool, prisma } = require('../db');
    expect(pgPool).toBeDefined();
    expect(prisma).toBeDefined();
  });
});
