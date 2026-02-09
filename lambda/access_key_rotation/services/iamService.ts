// IAM Service - Handles all IAM operations

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

const iamClient = new IAMClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function listIamUsers(): Promise<User[]> {
  try {
    Logger.info('Fetching all IAM users');
    const command = new ListUsersCommand({});
    const response = await iamClient.send(command);
    Logger.info(`Found ${response.Users?.length || 0} IAM users`);
    return response.Users || [];
  } catch (error) {
    Logger.error('Error listing IAM users', error);
    throw error;
  }
}

export async function listAccessKeys(username: string): Promise<AccessKeyInfo[]> {
  try {
    const command = new ListAccessKeysCommand({ UserName: username });
    const response = await iamClient.send(command);

    const keys: AccessKeyInfo[] = (response.AccessKeyMetadata || []).map((key: AccessKeyMetadata) => ({
      accessKeyId: key.AccessKeyId!,
      createDate: key.CreateDate!,
      status: key.Status as 'Active' | 'Inactive',
      userName: key.UserName!,
    }));

    Logger.debug(`Found ${keys.length} access keys for user ${username}`);
    return keys;
  } catch (error) {
    Logger.error(`Error listing access keys for user ${username}`, error);
    throw error;
  }
}

export async function createAccessKey(username: string): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  try {
    Logger.info(`Creating new access key for user ${username}`);
    const command = new CreateAccessKeyCommand({ UserName: username });
    const response = await iamClient.send(command);

    if (!response.AccessKey) {
      throw new Error('Failed to create access key');
    }

    Logger.info(`Successfully created new access key for user ${username}`, {
      keyId: response.AccessKey.AccessKeyId,
    });

    return {
      accessKeyId: response.AccessKey.AccessKeyId!,
      secretAccessKey: response.AccessKey.SecretAccessKey!,
    };
  } catch (error) {
    Logger.error(`Error creating access key for user ${username}`, error);
    throw error;
  }
}

export async function deleteAccessKey(username: string, accessKeyId: string): Promise<void> {
  try {
    Logger.info(`Deleting access key ${accessKeyId} for user ${username}`);
    const command = new DeleteAccessKeyCommand({
      UserName: username,
      AccessKeyId: accessKeyId,
    });
    await iamClient.send(command);
    Logger.info(`Successfully deleted access key ${accessKeyId} for user ${username}`);
  } catch (error) {
    Logger.error(`Error deleting access key ${accessKeyId} for user ${username}`, error);
    throw error;
  }
}

export async function updateAccessKeyStatus(
  username: string,
  accessKeyId: string,
  status: 'Active' | 'Inactive'
): Promise<void> {
  try {
    Logger.info(`Updating access key ${accessKeyId} status to ${status} for user ${username}`);
    const command = new UpdateAccessKeyCommand({
      UserName: username,
      AccessKeyId: accessKeyId,
      Status: status,
    });
    await iamClient.send(command);
    Logger.info(`Successfully updated access key ${accessKeyId} status to ${status}`);
  } catch (error) {
    Logger.error(`Error updating access key ${accessKeyId} status`, error);
    throw error;
  }
}

export async function getUserEmail(username: string): Promise<string | undefined> {
  try {
    const command = new GetUserCommand({ UserName: username });
    const response = await iamClient.send(command);

    // Try to get email from user tags
    const emailTag = response.User?.Tags?.find((tag: any) => tag.Key === 'Email' || tag.Key === 'email');
    return emailTag?.Value;
  } catch (error) {
    Logger.warning(`Could not retrieve email for user ${username}`, { error });
    return undefined;
  }
}

export async function getAccessKeyLastUsed(accessKeyId: string): Promise<Date | null> {
  try {
    const command = new GetAccessKeyLastUsedCommand({ AccessKeyId: accessKeyId });
    const response = await iamClient.send(command);

    // If LastUsedDate is undefined, the key has never been used
    if (!response.AccessKeyLastUsed?.LastUsedDate) {
      Logger.debug(`Access key ${accessKeyId} has never been used`);
      return null;
    }

    return response.AccessKeyLastUsed.LastUsedDate;
  } catch (error) {
    Logger.error(`Error getting last used date for key ${accessKeyId}`, error);
    return null;
  }
}
