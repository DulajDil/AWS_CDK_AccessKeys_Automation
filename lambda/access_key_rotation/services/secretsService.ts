// Secrets Manager Service - Handles storing and retrieving access keys

import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { Logger } from '../utils/logger';
import { SecretData } from '../types/interfaces';
import { SECRET_NAME_PREFIX } from '../utils/emailTemplates';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

export function createSecretName(username: string): string {
  return `${SECRET_NAME_PREFIX}/${username}`;
}

export async function storeAccessKey(
  username: string,
  accessKeyId: string,
  secretAccessKey: string,
  oldKeyId?: string
): Promise<void> {
  const secretName = createSecretName(username);

  const secretData: SecretData = {
    username,
    accessKeyId,
    secretAccessKey,
    createdDate: new Date().toISOString(),
    oldKeyId,
  };

  try {
    // Try to update existing secret first
    const existingSecret = await getSecret(secretName);

    if (existingSecret) {
      Logger.info(`Updating existing secret for user ${username}`);
      const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(secretData),
      });
      await secretsClient.send(command);
      Logger.info(`Successfully updated secret for user ${username}`);
    } else {
      throw new Error('Secret does not exist, will create new one');
    }
  } catch (error) {
    // If secret doesn't exist, create it
    try {
      Logger.info(`Creating new secret for user ${username}`);
      const command = new CreateSecretCommand({
        Name: secretName,
        Description: `IAM access key for user ${username}`,
        SecretString: JSON.stringify(secretData),
        Tags: [
          { Key: 'ManagedBy', Value: 'IAMKeyRotation' },
          { Key: 'Username', Value: username },
        ],
      });
      await secretsClient.send(command);
      Logger.info(`Successfully created secret for user ${username}`);
    } catch (createError) {
      Logger.error(`Error creating secret for user ${username}`, createError);
      throw createError;
    }
  }
}

export async function getSecret(secretName: string): Promise<SecretData | null> {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      return null;
    }

    return JSON.parse(response.SecretString) as SecretData;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      Logger.debug(`Secret ${secretName} not found`);
      return null;
    }
    Logger.error(`Error retrieving secret ${secretName}`, error);
    throw error;
  }
}

export async function updateSecretMetadata(
  username: string,
  updates: Partial<SecretData>
): Promise<void> {
  const secretName = createSecretName(username);

  try {
    const existingSecret = await getSecret(secretName);

    if (!existingSecret) {
      Logger.warning(`Cannot update non-existent secret for user ${username}`);
      return;
    }

    const updatedSecret = { ...existingSecret, ...updates };

    const command = new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(updatedSecret),
    });

    await secretsClient.send(command);
    Logger.info(`Successfully updated secret metadata for user ${username}`);
  } catch (error) {
    Logger.error(`Error updating secret metadata for user ${username}`, error);
    throw error;
  }
}
