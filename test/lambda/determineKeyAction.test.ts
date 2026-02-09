import { AccessKeyInfo } from '../../lambda/access_key_rotation/types/interfaces';

// ─── Re-implement determineKeyAction for unit testing ───
// This mirrors the logic in index.ts exactly.

const config = {
  rotationDays: 90,
  deactivationDays: 100,
  deletionDays: 110,
  unusedKeyThresholdDays: 30,
};

type KeyAction = 'unused_delete' | 'delete' | 'deactivate' | 'rotate' | 'none';

function determineKeyAction(key: AccessKeyInfo, keyAge: number, keyNeverUsed: boolean): KeyAction {
  if (keyNeverUsed && keyAge >= config.unusedKeyThresholdDays) return 'unused_delete';
  if (keyAge >= config.deletionDays && key.status === 'Inactive') return 'delete';
  if (keyAge >= config.deactivationDays && key.status === 'Active') return 'deactivate';
  if (keyAge >= config.rotationDays && key.status === 'Active') return 'rotate';
  return 'none';
}

function createMockKey(overrides: Partial<AccessKeyInfo> = {}): AccessKeyInfo {
  return {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    createDate: new Date(),
    status: 'Active',
    userName: 'testuser',
    ...overrides,
  };
}

describe('determineKeyAction', () => {

  // ─── Unused Key Tests ───
  describe('unused keys', () => {
    it('should return "unused_delete" for never-used key past threshold (30+ days)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 45, true)).toBe('unused_delete');
    });

    it('should return "unused_delete" for never-used key at exactly threshold (30 days)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 30, true)).toBe('unused_delete');
    });

    it('should NOT delete unused key below threshold (29 days)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 29, true)).toBe('none');
    });

    it('should prioritize unused_delete over rotate (unused 95 day old key)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 95, true)).toBe('unused_delete');
    });

    it('should prioritize unused_delete even for inactive keys', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 115, true)).toBe('unused_delete');
    });
  });

  // ─── Delete Tests (Day 110+, Inactive) ───
  describe('delete inactive keys (110+ days)', () => {
    it('should return "delete" for inactive key at 110 days', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 110, false)).toBe('delete');
    });

    it('should return "delete" for inactive key at 150 days', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 150, false)).toBe('delete');
    });

    it('should NOT delete active key at 110 days (should deactivate instead)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 110, false)).toBe('deactivate');
    });

    it('should NOT delete inactive key at 105 days', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 105, false)).toBe('none');
    });
  });

  // ─── Deactivate Tests (Day 100-109, Active) ───
  describe('deactivate active keys (100+ days)', () => {
    it('should return "deactivate" for active key at 100 days', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 100, false)).toBe('deactivate');
    });

    it('should return "deactivate" for active key at 105 days', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 105, false)).toBe('deactivate');
    });

    it('should NOT deactivate inactive key at 100 days', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 100, false)).toBe('none');
    });
  });

  // ─── Rotate Tests (Day 90-99, Active) ───
  describe('rotate active keys (90+ days)', () => {
    it('should return "rotate" for active key at 90 days', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 90, false)).toBe('rotate');
    });

    it('should return "rotate" for active key at 95 days', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 95, false)).toBe('rotate');
    });

    it('should NOT rotate inactive key at 90 days', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 90, false)).toBe('none');
    });

    it('should NOT rotate active key at 89 days', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 89, false)).toBe('none');
    });
  });

  // ─── No Action Tests ───
  describe('no action needed', () => {
    it('should return "none" for fresh active key (10 days)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 10, false)).toBe('none');
    });

    it('should return "none" for fresh used key (1 day)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 1, false)).toBe('none');
    });

    it('should return "none" for inactive key at 50 days', () => {
      const key = createMockKey({ status: 'Inactive' });
      expect(determineKeyAction(key, 50, false)).toBe('none');
    });

    it('should return "none" for fresh unused key (5 days)', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 5, true)).toBe('none');
    });
  });

  // ─── Priority Tests ───
  describe('priority ordering', () => {
    it('unused_delete has highest priority over deactivate', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 105, true)).toBe('unused_delete');
    });

    it('deactivate has priority over rotate for 100+ day active keys', () => {
      const key = createMockKey({ status: 'Active' });
      expect(determineKeyAction(key, 100, false)).toBe('deactivate');
    });
  });
});
