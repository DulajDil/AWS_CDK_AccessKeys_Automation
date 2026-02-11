/**
 * IAM Service — Wrapper around the AWS IAM SDK.
 *
 * Provides helper functions for the common IAM operations the rotation
 * Lambda needs: listing users, listing/creating/deleting/updating access
 * keys, and reading user metadata (email tag).
 */

import {
  IAMClient,
  ListUsersCommand,
  ListAccessKeysCommand,
  CreateAccessKeyCommand,
  DeleteAccessKeyCommand,
  UpdateAccessKeyCommand,
  GetUserCommand,
  GetAccessKeyLastUsedCommand,
  AccessKeyMetadata,
  User,
} from '@aws-sdk/client-iam';
import { Logger } from '../utils/logger';
import { AccessKeyInfo } from '../types/interfaces';

/** Shared IAM client — reused across invocations in the same Lambda container. */
const iamClient = new IAMClient({ region: process.env.AWS_REGION || 'us-east-1' });

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

/** Fetch all IAM users in the account. */
export async function listIamUsers(): Promise<User[]> {
  try {
    Logger.info('Fetching IAM users');
    const response = await iamClient.send(new ListUsersCommand({}));
    const count = response.Users?.length ?? 0;
    Logger.info(`Found ${count} IAM user(s)`);
    return response.Users || [];
  } catch (error) {
    Logger.error('Failed to list IAM users', error);
    throw error;
  }
}

/**
 * Look up the user's email address from their IAM tags.
 * Returns `undefined` if no "Email" / "email" tag is set.
 */
export async function getUserEmail(username: string): Promise<string | undefined> {
  try {
    const response = await iamClient.send(new GetUserCommand({ UserName: username }));
    const emailTag = response.User?.Tags?.find(
      (tag: any) => tag.Key === 'Email' || tag.Key === 'email',
    );
    return emailTag?.Value;
  } catch (error) {
    Logger.warning(`Could not retrieve email tag for user ${username}`, { error });
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Access key operations
// ---------------------------------------------------------------------------

/**
 * List all access keys for a given IAM user and return them as
 * normalised `AccessKeyInfo` objects.
 */
export async function listAccessKeys(username: string): Promise<AccessKeyInfo[]> {
  try {
    const response = await iamClient.send(
      new ListAccessKeysCommand({ UserName: username }),
    );

    const keys: AccessKeyInfo[] = (response.AccessKeyMetadata || []).map(
      (key: AccessKeyMetadata) => ({
        accessKeyId: key.AccessKeyId!,
        createDate: key.CreateDate!,
        status: key.Status as 'Active' | 'Inactive',
        userName: key.UserName!,
      }),
    );

    Logger.debug(`Found ${keys.length} access key(s) for user ${username}`);
    return keys;
  } catch (error) {
    Logger.error(`Failed to list access keys for user ${username}`, error);
    throw error;
  }
}

/** Create a new access key pair for the given user. */
export async function createAccessKey(
  username: string,
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  try {
    const response = await iamClient.send(
      new CreateAccessKeyCommand({ UserName: username }),
    );

    if (!response.AccessKey) {
      throw new Error('IAM returned empty AccessKey — creation may have failed');
    }

    Logger.info(`Created new access key for user ${username}`, {
      keyId: response.AccessKey.AccessKeyId,
    });

    return {
      accessKeyId: response.AccessKey.AccessKeyId!,
      secretAccessKey: response.AccessKey.SecretAccessKey!,
    };
  } catch (error) {
    Logger.error(`Failed to create access key for user ${username}`, error);
    throw error;
  }
}

/** Permanently delete an access key. */
export async function deleteAccessKey(username: string, accessKeyId: string): Promise<void> {
  try {
    await iamClient.send(
      new DeleteAccessKeyCommand({ UserName: username, AccessKeyId: accessKeyId }),
    );
    Logger.info(`Deleted access key ${accessKeyId} for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to delete access key ${accessKeyId} for user ${username}`, error);
    throw error;
  }
}

/** Set an access key to Active or Inactive. */
export async function updateAccessKeyStatus(
  username: string,
  accessKeyId: string,
  status: 'Active' | 'Inactive',
): Promise<void> {
  try {
    await iamClient.send(
      new UpdateAccessKeyCommand({
        UserName: username,
        AccessKeyId: accessKeyId,
        Status: status,
      }),
    );
    Logger.info(`Updated key ${accessKeyId} to ${status} for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to update key ${accessKeyId} status for user ${username}`, error);
    throw error;
  }
}

/**
 * Check when an access key was last used.
 * Returns `null` if the key has never been used.
 */
export async function getAccessKeyLastUsed(accessKeyId: string): Promise<Date | null> {
  try {
    const response = await iamClient.send(
      new GetAccessKeyLastUsedCommand({ AccessKeyId: accessKeyId }),
    );

    if (!response.AccessKeyLastUsed?.LastUsedDate) {
      return null;
    }

    return response.AccessKeyLastUsed.LastUsedDate;
  } catch (error) {
    Logger.error(`Failed to get last-used date for key ${accessKeyId}`, error);
    return null;
  }
}
