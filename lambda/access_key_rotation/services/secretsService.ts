/**
 * Secrets Manager Service — Stores and retrieves IAM access key credentials.
 *
 * When a key is rotated, the new credentials are saved in Secrets Manager
 * so the user (or automation) can retrieve them without manual handoff.
 * Each user gets one secret named `<prefix>/<username>`.
 */

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

/** Shared Secrets Manager client — reused across invocations. */
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the Secrets Manager secret name for a given IAM user. */
export function createSecretName(username: string): string {
  return `${SECRET_NAME_PREFIX}/${username}`;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Store (or update) the newly created access key in Secrets Manager.
 *
 * Strategy:
 *   1. Try to fetch the existing secret.
 *   2. If it exists, overwrite the secret value.
 *   3. If it doesn't exist, create a brand-new secret.
 */
export async function storeAccessKey(
  username: string,
  accessKeyId: string,
  secretAccessKey: string,
  oldKeyId?: string,
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
    // Check whether a secret already exists for this user
    const existingSecret = await getSecret(secretName);

    if (existingSecret) {
      // Update the existing secret with the new key material
      await secretsClient.send(
        new PutSecretValueCommand({
          SecretId: secretName,
          SecretString: JSON.stringify(secretData),
        }),
      );
      Logger.info(`Updated existing secret for user ${username}`);
    } else {
      throw new Error('Secret does not exist, will create new one');
    }
  } catch (error) {
    // Secret does not exist yet — create it
    try {
      await secretsClient.send(
        new CreateSecretCommand({
          Name: secretName,
          Description: `IAM access key for user ${username}`,
          SecretString: JSON.stringify(secretData),
          Tags: [
            { Key: 'ManagedBy', Value: 'IAMKeyRotation' },
            { Key: 'Username', Value: username },
          ],
        }),
      );
      Logger.info(`Created new secret for user ${username}`);
    } catch (createError) {
      Logger.error(`Failed to create secret for user ${username}`, createError);
      throw createError;
    }
  }
}

/**
 * Retrieve and parse an existing secret by name.
 * Returns `null` if the secret does not exist.
 */
export async function getSecret(secretName: string): Promise<SecretData | null> {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );

    if (!response.SecretString) {
      return null;
    }

    return JSON.parse(response.SecretString) as SecretData;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      Logger.debug(`Secret ${secretName} not found — will create a new one`);
      return null;
    }
    Logger.error(`Failed to retrieve secret ${secretName}`, error);
    throw error;
  }
}

/**
 * Partially update the metadata of an existing secret (e.g. add a
 * deactivation or deletion date) without replacing the key material.
 */
export async function updateSecretMetadata(
  username: string,
  updates: Partial<SecretData>,
): Promise<void> {
  const secretName = createSecretName(username);

  try {
    const existingSecret = await getSecret(secretName);

    if (!existingSecret) {
      Logger.warning(`Cannot update metadata — no secret exists for user ${username}`);
      return;
    }

    const updatedSecret = { ...existingSecret, ...updates };

    await secretsClient.send(
      new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(updatedSecret),
      }),
    );
    Logger.info(`Updated secret metadata for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to update secret metadata for user ${username}`, error);
    throw error;
  }
}
