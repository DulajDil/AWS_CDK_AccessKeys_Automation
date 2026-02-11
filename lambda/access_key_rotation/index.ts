/**
 * Main Lambda Handler — Entry point for the IAM Access Key Rotation function.
 *
 * This Lambda is triggered daily by an EventBridge rule. It iterates over
 * every IAM user, inspects each access key, and applies the appropriate
 * lifecycle action based on the key's age and usage:
 *
 *   Day 0   – Key created
 *   Day 90  – ROTATE:     Create a new key, store it in Secrets Manager.
 *   Day 100 – DEACTIVATE: Disable the old key so the user must switch.
 *   Day 110 – DELETE:     Permanently remove the old key.
 *   Day 30  – UNUSED DELETE: Remove keys that were never used.
 *
 * Each action sends a notification email via SES so the user is always
 * aware of what happened and what they need to do next.
 */

import { Logger } from './utils/logger';
import { calculateKeyAge, addDays } from './utils/dateUtils';
import { Config, RotationResult, LambdaResponse, AccessKeyInfo } from './types/interfaces';
import * as iamService from './services/iamService';
import * as secretsService from './services/secretsService';
import * as sesService from './services/sesService';

// ---------------------------------------------------------------------------
// Configuration — loaded once from environment variables at cold-start.
// ---------------------------------------------------------------------------
const config: Config = {
  rotationDays: parseInt(process.env.ROTATION_DAYS || '90'),
  deactivationDays: parseInt(process.env.DEACTIVATION_DAYS || '100'),
  deletionDays: parseInt(process.env.DELETION_DAYS || '110'),
  unusedKeyThresholdDays: parseInt(process.env.UNUSED_KEY_THRESHOLD_DAYS || '30'),
  senderEmail: process.env.SENDER_EMAIL!,
  dryRun: process.env.DRY_RUN === 'true',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All possible actions the rotation engine can decide for a single key. */
type KeyAction = 'unused_delete' | 'delete' | 'deactivate' | 'rotate' | 'none';

// ---------------------------------------------------------------------------
// Decision logic
// ---------------------------------------------------------------------------

/**
 * Decide which lifecycle action to apply to a single access key.
 *
 * The checks are ordered by priority — highest-severity action wins:
 *   1. Unused keys past threshold     -> delete immediately
 *   2. Inactive keys past deletion    -> permanently delete
 *   3. Active keys past deactivation  -> deactivate
 *   4. Active keys past rotation      -> rotate (create new key)
 *   5. Otherwise                      -> no action
 */
function determineKeyAction(key: AccessKeyInfo, keyAge: number, keyNeverUsed: boolean): KeyAction {
  if (keyNeverUsed && keyAge >= config.unusedKeyThresholdDays) return 'unused_delete';
  if (keyAge >= config.deletionDays && key.status === 'Inactive') return 'delete';
  if (keyAge >= config.deactivationDays && key.status === 'Active') return 'deactivate';
  if (keyAge >= config.rotationDays && key.status === 'Active') return 'rotate';
  return 'none';
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute the lifecycle action determined by `determineKeyAction`.
 * Returns a `RotationResult` that is appended to the run summary, or
 * `null` when no action was needed.
 */
async function executeKeyAction(
  action: KeyAction,
  username: string,
  key: AccessKeyInfo,
  keyAge: number,
  userEmail: string,
  lastUsedDate: Date | null,
): Promise<RotationResult | null> {
  switch (action) {
    case 'unused_delete':
      return handleUnusedKeyDeletion(username, key.accessKeyId, keyAge);

    case 'delete':
      return handleKeyDeletion(username, key.accessKeyId, userEmail);

    case 'deactivate':
      return handleKeyDeactivation(username, key.accessKeyId, userEmail);

    case 'rotate':
      return handleKeyRotation(username, key.accessKeyId, userEmail);

    case 'none':
      Logger.debug(`No action needed for key ${key.accessKeyId}`, {
        user: username,
        keyAge,
        status: key.status,
        lastUsed: lastUsedDate?.toISOString() ?? 'never',
      });
      return null;
  }
}

// ---------------------------------------------------------------------------
// Summary bookkeeping
// ---------------------------------------------------------------------------

/** Map a result action to its corresponding summary counter and increment it. */
function updateSummary(summary: LambdaResponse['summary'], result: RotationResult): void {
  const counterMap: Record<string, keyof LambdaResponse['summary']> = {
    created: 'keysRotated',
    deactivated: 'keysDeactivated',
    deleted: 'keysDeleted',
    unused_deleted: 'unusedKeysDeleted',
    error: 'errors',
  };

  const field = counterMap[result.action];
  if (field) summary[field]++;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Lambda entry point. Processes all IAM users and their access keys,
 * applies the correct lifecycle action, and returns a structured summary.
 */
export const handler = async (event: any): Promise<LambdaResponse> => {
  const mode = config.dryRun ? 'DRY RUN' : 'LIVE';
  Logger.info(`Starting IAM access key rotation [${mode}]`, {
    rotationDays: config.rotationDays,
    deactivationDays: config.deactivationDays,
    deletionDays: config.deletionDays,
    unusedKeyThresholdDays: config.unusedKeyThresholdDays,
  });

  const summary: LambdaResponse['summary'] = {
    totalUsers: 0,
    keysRotated: 0,
    keysDeactivated: 0,
    keysDeleted: 0,
    unusedKeysDeleted: 0,
    errors: 0,
  };

  const results: RotationResult[] = [];

  try {
    // Fetch every IAM user in the account
    const users = await iamService.listIamUsers();
    summary.totalUsers = users.length;
    Logger.info(`Found ${users.length} IAM user(s) to process`);

    for (const user of users) {
      const username = user.UserName!;

      try {
        // Resolve the user's email from IAM tags (falls back to sender)
        const userEmail = await iamService.getUserEmail(username) || config.senderEmail;
        const accessKeys = await iamService.listAccessKeys(username);

        if (accessKeys.length === 0) {
          Logger.debug(`Skipping user ${username} — no access keys`);
          continue;
        }

        Logger.info(`Processing ${accessKeys.length} key(s) for user ${username}`);

        for (const key of accessKeys) {
          const keyAge = calculateKeyAge(key.createDate);
          const lastUsedDate = await iamService.getAccessKeyLastUsed(key.accessKeyId);
          const keyNeverUsed = lastUsedDate === null;

          let action = determineKeyAction(key, keyAge, keyNeverUsed);

          // AWS limits each user to 2 access keys. If the user already has 2,
          // rotation was already performed — skip creating another key.
          if (action === 'rotate' && accessKeys.length >= 2) {
            Logger.info(`Skipping rotation for user ${username} — already has ${accessKeys.length} keys`);
            action = 'none';
          }

          if (action !== 'none') {
            Logger.info(`Action "${action}" determined for key ${key.accessKeyId}`, {
              user: username,
              keyAge,
              status: key.status,
              lastUsed: lastUsedDate?.toISOString() ?? 'never',
            });
          }

          const result = await executeKeyAction(action, username, key, keyAge, userEmail, lastUsedDate);

          if (result) {
            results.push(result);
            updateSummary(summary, result);
          }
        }
      } catch (error) {
        Logger.error(`Failed to process user ${username}`, error);
        const errorResult: RotationResult = {
          userName: username,
          action: 'error',
          message: (error as Error).message,
        };
        results.push(errorResult);
        updateSummary(summary, errorResult);

        // Notify admins about the per-user failure
        await sesService.sendErrorEmail(username, (error as Error).message);
      }
    }

    Logger.info('Rotation run completed', { summary });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'IAM access key rotation completed successfully', summary, results }),
      summary,
    };
  } catch (error) {
    Logger.error('Fatal error — rotation run aborted', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'IAM access key rotation failed', error: (error as Error).message }),
      summary,
    };
  }
};

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * ROTATE (Day 90) — Create a new access key and store it in Secrets Manager.
 * The old key stays active for a grace period so the user can switch over.
 */
async function handleKeyRotation(
  username: string,
  oldKeyId: string,
  userEmail: string
): Promise<RotationResult> {
  try {
    if (config.dryRun) {
      Logger.info(`[DRY RUN] Would rotate key ${oldKeyId} for user ${username}`);
      return {
        userName: username,
        action: 'created',
        oldKeyId,
        message: '[DRY RUN] Would create new access key (old key stays active for 10 days)',
      };
    }

    // Create the replacement key
    const newKey = await iamService.createAccessKey(username);

    // Persist the new credentials in Secrets Manager
    await secretsService.storeAccessKey(username, newKey.accessKeyId, newKey.secretAccessKey, oldKeyId);

    // Notify the user — they have (deactivationDays - rotationDays) days to switch
    const deactivationDate = addDays(new Date(), config.deactivationDays - config.rotationDays);
    await sesService.sendRotationEmail(username, userEmail, oldKeyId, newKey.accessKeyId, deactivationDate);

    Logger.info(`Rotated key for user ${username}`, { oldKeyId, newKeyId: newKey.accessKeyId });

    return {
      userName: username,
      action: 'created',
      oldKeyId,
      newKeyId: newKey.accessKeyId,
      message: 'New key created and stored in Secrets Manager. Old key still active for 10 days.',
    };
  } catch (error) {
    Logger.error(`Failed to rotate key for user ${username}`, error, { oldKeyId });
    return { userName: username, action: 'error', oldKeyId, message: (error as Error).message };
  }
}

/**
 * DEACTIVATE (Day 100) — Disable the old key to force the user onto the new one.
 * The key is not deleted yet in case the user needs emergency rollback.
 */
async function handleKeyDeactivation(
  username: string,
  keyId: string,
  userEmail: string
): Promise<RotationResult> {
  try {
    if (config.dryRun) {
      Logger.info(`[DRY RUN] Would deactivate key ${keyId} for user ${username}`);
      return {
        userName: username,
        action: 'deactivated',
        oldKeyId: keyId,
        message: '[DRY RUN] Would deactivate access key',
      };
    }

    await iamService.updateAccessKeyStatus(username, keyId, 'Inactive');

    // Warn user — key will be permanently deleted in (deletionDays - deactivationDays) days
    const deletionDate = addDays(new Date(), config.deletionDays - config.deactivationDays);
    await sesService.sendDeactivationEmail(username, userEmail, keyId, deletionDate);

    Logger.info(`Deactivated key ${keyId} for user ${username}`);

    return {
      userName: username,
      action: 'deactivated',
      oldKeyId: keyId,
      message: 'Old key deactivated. Will be permanently deleted in 10 days.',
    };
  } catch (error) {
    Logger.error(`Failed to deactivate key for user ${username}`, error, { keyId });
    return { userName: username, action: 'error', oldKeyId: keyId, message: (error as Error).message };
  }
}

/**
 * DELETE (Day 110) — Permanently remove the old, inactive key.
 * At this point the user should already be using the new key.
 */
async function handleKeyDeletion(
  username: string,
  keyId: string,
  userEmail: string
): Promise<RotationResult> {
  try {
    if (config.dryRun) {
      Logger.info(`[DRY RUN] Would delete key ${keyId} for user ${username}`);
      return {
        userName: username,
        action: 'deleted',
        oldKeyId: keyId,
        message: '[DRY RUN] Would permanently delete access key',
      };
    }

    await iamService.deleteAccessKey(username, keyId);
    await sesService.sendDeletionEmail(username, userEmail, keyId);

    Logger.info(`Deleted key ${keyId} for user ${username}`);

    return {
      userName: username,
      action: 'deleted',
      oldKeyId: keyId,
      message: 'Old access key permanently deleted',
    };
  } catch (error) {
    Logger.error(`Failed to delete key for user ${username}`, error, { keyId });
    return { userName: username, action: 'error', oldKeyId: keyId, message: (error as Error).message };
  }
}

/**
 * UNUSED DELETE (Day 30+, never used) — Remove keys that were created but
 * never used. These are a security risk (likely orphaned or test keys).
 * Notification goes to the admin/sender, not the user.
 */
async function handleUnusedKeyDeletion(
  username: string,
  keyId: string,
  keyAge: number
): Promise<RotationResult> {
  try {
    if (config.dryRun) {
      Logger.info(`[DRY RUN] Would delete unused key ${keyId} for user ${username} (${keyAge} days old)`);
      return {
        userName: username,
        action: 'unused_deleted',
        oldKeyId: keyId,
        message: `[DRY RUN] Would delete unused key (${keyAge} days old, never used)`,
      };
    }

    await iamService.deleteAccessKey(username, keyId);
    await sesService.sendUnusedKeyDeletedEmail(username, keyId, keyAge);

    Logger.info(`Deleted unused key ${keyId} for user ${username}`, { keyAge });

    return {
      userName: username,
      action: 'unused_deleted',
      oldKeyId: keyId,
      message: `Unused key deleted (${keyAge} days old, never used)`,
    };
  } catch (error) {
    Logger.error(`Failed to delete unused key for user ${username}`, error, { keyId, keyAge });
    return { userName: username, action: 'error', oldKeyId: keyId, message: (error as Error).message };
  }
}
