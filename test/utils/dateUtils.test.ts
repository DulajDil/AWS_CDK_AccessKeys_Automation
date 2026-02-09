import { calculateKeyAge, isKeyExpired, addDays, formatDate, formatDateForEmail } from '../../lambda/access_key_rotation/utils/dateUtils';

describe('dateUtils', () => {
  describe('calculateKeyAge', () => {
    it('should return 0 for a key created today', () => {
      const today = new Date();
      const age = calculateKeyAge(today);
      expect(age).toBeLessThanOrEqual(1); // Could be 0 or 1 depending on time of day
    });

    it('should return correct age for a key created 90 days ago', () => {
      const date = new Date();
      date.setDate(date.getDate() - 90);
      const age = calculateKeyAge(date);
      // Math.ceil can round up by 1 depending on time of day
      expect(age).toBeGreaterThanOrEqual(90);
      expect(age).toBeLessThanOrEqual(91);
    });

    it('should return correct age for a key created 110 days ago', () => {
      const date = new Date();
      date.setDate(date.getDate() - 110);
      const age = calculateKeyAge(date);
      expect(age).toBeGreaterThanOrEqual(110);
      expect(age).toBeLessThanOrEqual(111);
    });

    it('should return correct age for a key created 1 day ago', () => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const age = calculateKeyAge(date);
      expect(age).toBeGreaterThanOrEqual(1);
      expect(age).toBeLessThanOrEqual(2);
    });
  });

  describe('isKeyExpired', () => {
    it('should return true when key age exceeds threshold', () => {
      const date = new Date();
      date.setDate(date.getDate() - 100);
      expect(isKeyExpired(date, 90)).toBe(true);
    });

    it('should return true when key age equals threshold', () => {
      const date = new Date();
      date.setDate(date.getDate() - 90);
      expect(isKeyExpired(date, 90)).toBe(true);
    });

    it('should return false when key age is below threshold', () => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      expect(isKeyExpired(date, 90)).toBe(false);
    });
  });

  describe('addDays', () => {
    it('should add days correctly', () => {
      const date = new Date('2026-01-01');
      const result = addDays(date, 10);
      expect(result.getDate()).toBe(11);
      expect(result.getMonth()).toBe(0); // January
    });

    it('should handle month rollover', () => {
      const date = new Date('2026-01-25');
      const result = addDays(date, 10);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(4);
    });

    it('should not mutate the original date', () => {
      const date = new Date('2026-01-01');
      const originalTime = date.getTime();
      addDays(date, 10);
      expect(date.getTime()).toBe(originalTime);
    });
  });

  describe('formatDate', () => {
    it('should return YYYY-MM-DD format', () => {
      const date = new Date('2026-03-15T12:00:00.000Z');
      expect(formatDate(date)).toBe('2026-03-15');
    });
  });

  describe('formatDateForEmail', () => {
    it('should return a human-readable date string', () => {
      const date = new Date('2026-03-15T12:00:00.000Z');
      const formatted = formatDateForEmail(date);
      // Should contain year, month name, and day
      expect(formatted).toContain('2026');
      expect(formatted).toContain('March');
      expect(formatted).toContain('15');
    });
  });
});
