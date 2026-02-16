/**
 * Shared TypeScript interfaces used across the rotation Lambda.
 */

/** Normalised representation of a single IAM access key. */
export interface AccessKeyInfo {
  accessKeyId: string;
  createDate: Date;
  status: 'Active' | 'Inactive';
  userName: string;
}

/** Snapshot of one IAM user and their associated keys/email. */
export interface UserKeyStatus {
  userName: string;
  accessKeys: AccessKeyInfo[];
  email?: string;
}

/** The outcome of processing a single access key. */
export interface RotationResult {
  userName: string;
  /** What happened: created (rotated), deactivated, deleted, unused_deleted, skipped, or error. */
  action: 'created' | 'deactivated' | 'deleted' | 'unused_deleted' | 'skipped' | 'error';
  oldKeyId?: string;
  newKeyId?: string;
  message: string;
}

/** The top-level response returned by the Lambda handler. */
export interface LambdaResponse {
  statusCode: number;
  body: string;
  /** Aggregate counters for the entire run. */
  summary: {
    totalUsers: number;
    keysRotated: number;
    keysDeactivated: number;
    keysDeleted: number;
    unusedKeysDeleted: number;
    errors: number;
  };
}

/** Runtime configuration loaded from environment variables. */
export interface Config {
  /** Days after creation before a new key is created (default 90). */
  rotationDays: number;
  /** Days after creation before the old key is deactivated (default 100). */
  deactivationDays: number;
  /** Days after creation before the old key is permanently deleted (default 110). */
  deletionDays: number;
  /** Days after creation before a never-used key is deleted (default 30). */
  unusedKeyThresholdDays: number;
  /** Verified SES email used as the "From" address and admin recipient. */
  senderEmail: string;
  /** When true the Lambda simulates actions without making changes. */
  dryRun: boolean;
}

/** Payload persisted in Secrets Manager for each rotated user. */
export interface SecretData {
  username: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** ISO-8601 timestamp of when the key was stored. */
  createdDate: string;
  /** The key ID that was replaced (if applicable). */
  oldKeyId?: string;
  /** ISO-8601 date when the old key will be deactivated. */
  deactivationDate?: string;
  /** ISO-8601 date when the old key will be permanently deleted. */
  deletionDate?: string;
}
