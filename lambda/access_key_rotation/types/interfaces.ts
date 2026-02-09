// TypeScript interfaces for type safety

export interface AccessKeyInfo {
  accessKeyId: string;
  createDate: Date;
  status: 'Active' | 'Inactive';
  userName: string;
}

export interface UserKeyStatus {
  userName: string;
  accessKeys: AccessKeyInfo[];
  email?: string;
}

export interface RotationResult {
  userName: string;
  action: 'created' | 'deactivated' | 'deleted' | 'unused_deleted' | 'skipped' | 'error';
  oldKeyId?: string;
  newKeyId?: string;
  message: string;
}

export interface LambdaResponse {
  statusCode: number;
  body: string;
  summary: {
    totalUsers: number;
    keysRotated: number;
    keysDeactivated: number;
    keysDeleted: number;
    unusedKeysDeleted: number;
    errors: number;
  };
}

export interface Config {
  rotationDays: number;
  deactivationDays: number;
  deletionDays: number;
  unusedKeyThresholdDays: number;
  senderEmail: string;
  dryRun: boolean;
}

export interface SecretData {
  username: string;
  accessKeyId: string;
  secretAccessKey: string;
  createdDate: string;
  oldKeyId?: string;
  deactivationDate?: string;
  deletionDate?: string;
}
