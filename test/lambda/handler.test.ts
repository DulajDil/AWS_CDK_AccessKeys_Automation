// Set environment variables BEFORE any imports
process.env.ROTATION_DAYS = '90';
process.env.DEACTIVATION_DAYS = '100';
process.env.DELETION_DAYS = '110';
process.env.UNUSED_KEY_THRESHOLD_DAYS = '30';
process.env.SENDER_EMAIL = 'test@example.com';
process.env.DRY_RUN = 'false';

// Variables prefixed with "mock" are allowed inside jest.mock() factories
const mockIamSend = jest.fn();
const mockSecretsSend = jest.fn();
const mockSesSend = jest.fn();

jest.mock('@aws-sdk/client-iam', () => ({
  IAMClient: jest.fn(() => ({ send: mockIamSend })),
  ListUsersCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'ListUsers', ...i })),
  ListAccessKeysCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'ListAccessKeys', ...i })),
  CreateAccessKeyCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'CreateAccessKey', ...i })),
  DeleteAccessKeyCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'DeleteAccessKey', ...i })),
  UpdateAccessKeyCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'UpdateAccessKey', ...i })),
  GetUserCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'GetUser', ...i })),
  GetAccessKeyLastUsedCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'GetAccessKeyLastUsed', ...i })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSecretsSend })),
  CreateSecretCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'CreateSecret', ...i })),
  UpdateSecretCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'UpdateSecret', ...i })),
  GetSecretValueCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'GetSecretValue', ...i })),
  PutSecretValueCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'PutSecretValue', ...i })),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn().mockImplementation((i: any) => ({ _cmd: 'SendEmail', ...i })),
}));

import { handler } from '../../lambda/access_key_rotation/index';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// Route IAM send calls based on command type
function routeIamCalls(routes: Record<string, any | any[]>) {
  const counters: Record<string, number> = {};
  mockIamSend.mockImplementation((cmd: any) => {
    const type = cmd._cmd;
    if (!routes[type]) return Promise.resolve({});
    const val = routes[type];
    if (val instanceof Error) return Promise.reject(val);
    if (Array.isArray(val)) {
      counters[type] = counters[type] || 0;
      const item = val[counters[type]++];
      if (item instanceof Error) return Promise.reject(item);
      return Promise.resolve(item ?? {});
    }
    return Promise.resolve(val);
  });
}

describe('Lambda Handler', () => {
  beforeEach(() => {
    mockIamSend.mockReset();
    mockSecretsSend.mockReset().mockResolvedValue({});
    mockSesSend.mockReset().mockResolvedValue({});
  });

  // ─── Basic ───
  describe('basic flow', () => {
    it('should return 200 when no users exist', async () => {
      routeIamCalls({ ListUsers: { Users: [] } });
      const r = await handler({});
      expect(r.statusCode).toBe(200);
      expect(r.summary.totalUsers).toBe(0);
      expect(r.summary.keysRotated).toBe(0);
      expect(r.summary.unusedKeysDeleted).toBe(0);
    });

    it('should skip users with no access keys', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'u1' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: { AccessKeyMetadata: [] },
      });
      const r = await handler({});
      expect(r.statusCode).toBe(200);
      expect(r.summary.totalUsers).toBe(1);
      expect(r.summary.keysRotated).toBe(0);
    });

    it('should return 500 on fatal error', async () => {
      routeIamCalls({ ListUsers: new Error('boom') });
      const r = await handler({});
      expect(r.statusCode).toBe(500);
      expect(r.body).toContain('boom');
    });
  });

  // ─── Rotate (90+) ───
  describe('key rotation (90+ days)', () => {
    it('should rotate a 95-day old active key', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'u1' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: [
          { AccessKeyMetadata: [{ AccessKeyId: 'OLD', CreateDate: daysAgo(95), Status: 'Active', UserName: 'u1' }] },
          { AccessKeyMetadata: [{ AccessKeyId: 'OLD' }] }, // 2-key check
        ],
        GetAccessKeyLastUsed: { AccessKeyLastUsed: { LastUsedDate: new Date() } },
        CreateAccessKey: { AccessKey: { AccessKeyId: 'NEW', SecretAccessKey: 'SEC' } },
      });
      // Secrets: get → not found, create → ok
      mockSecretsSend
        .mockRejectedValueOnce(Object.assign(new Error(), { name: 'ResourceNotFoundException' }))
        .mockResolvedValueOnce({});

      const r = await handler({});
      expect(r.statusCode).toBe(200);
      expect(r.summary.keysRotated).toBe(1);
    });

    it('should NOT rotate a 60-day old key', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'u1' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: { AccessKeyMetadata: [{ AccessKeyId: 'K', CreateDate: daysAgo(60), Status: 'Active', UserName: 'u1' }] },
        GetAccessKeyLastUsed: { AccessKeyLastUsed: { LastUsedDate: new Date() } },
      });
      const r = await handler({});
      expect(r.summary.keysRotated).toBe(0);
    });
  });

  // ─── Deactivate (100+) ───
  describe('key deactivation (100+ days)', () => {
    it('should deactivate a 105-day old active key', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'u1' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: { AccessKeyMetadata: [{ AccessKeyId: 'K', CreateDate: daysAgo(105), Status: 'Active', UserName: 'u1' }] },
        GetAccessKeyLastUsed: { AccessKeyLastUsed: { LastUsedDate: new Date() } },
        UpdateAccessKey: {},
      });
      const r = await handler({});
      expect(r.summary.keysDeactivated).toBe(1);
    });
  });

  // ─── Delete (110+, Inactive) ───
  describe('key deletion (110+ days, inactive)', () => {
    it('should delete a 115-day old inactive key', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'u1' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: { AccessKeyMetadata: [{ AccessKeyId: 'K', CreateDate: daysAgo(115), Status: 'Inactive', UserName: 'u1' }] },
        GetAccessKeyLastUsed: { AccessKeyLastUsed: { LastUsedDate: new Date() } },
        DeleteAccessKey: {},
      });
      const r = await handler({});
      expect(r.summary.keysDeleted).toBe(1);
    });
  });

  // ─── Unused (never used, 30+) ───
  describe('unused key deletion', () => {
    it('should delete a 45-day old never-used key', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'sys' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: { AccessKeyMetadata: [{ AccessKeyId: 'K', CreateDate: daysAgo(45), Status: 'Active', UserName: 'sys' }] },
        GetAccessKeyLastUsed: { AccessKeyLastUsed: {} },
        DeleteAccessKey: {},
      });
      const r = await handler({});
      expect(r.summary.unusedKeysDeleted).toBe(1);
    });

    it('should NOT delete a 10-day old never-used key', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'new' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: { AccessKeyMetadata: [{ AccessKeyId: 'K', CreateDate: daysAgo(10), Status: 'Active', UserName: 'new' }] },
        GetAccessKeyLastUsed: { AccessKeyLastUsed: {} },
      });
      const r = await handler({});
      expect(r.summary.unusedKeysDeleted).toBe(0);
    });
  });

  // ─── Error handling ───
  describe('error handling', () => {
    it('should count errors when user processing fails', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'bad' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: new Error('Access denied'),
      });
      const r = await handler({});
      expect(r.statusCode).toBe(200);
      expect(r.summary.errors).toBe(1);
    });

    it('should continue processing other users after an error', async () => {
      routeIamCalls({
        ListUsers: { Users: [{ UserName: 'bad' }, { UserName: 'good' }] },
        GetUser: { User: { Tags: [] } },
        ListAccessKeys: [
          new Error('Access denied'), // bad user fails
          { AccessKeyMetadata: [] },  // good user has no keys
        ],
      });
      const r = await handler({});
      expect(r.statusCode).toBe(200);
      expect(r.summary.totalUsers).toBe(2);
      expect(r.summary.errors).toBe(1);
    });
  });
});
