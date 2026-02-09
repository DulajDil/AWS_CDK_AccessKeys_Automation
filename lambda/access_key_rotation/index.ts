// Main Lambda Handler - Entry point for the Lambda function

import { Logger } from './utils/logger';
import { calculateKeyAge, addDays } from './utils/dateUtils';
import { Config, RotationResult, LambdaResponse, AccessKeyInfo } from './types/interfaces';
import * as iamService from './services/iamService';
import * as secretsService from './services/secretsService';
import * as sesService from './services/sesService';

// Load configuration from environment variables
const config: Config = {
  rotationDays: parseInt(process.env.ROTATION_DAYS || '90'),
  deactivationDays: parseInt(process.env.DEACTIVATION_DAYS || '100'),
  deletionDays: parseInt(process.env.DELETION_DAYS || '110'),
  unusedKeyThresholdDays: parseInt(process.env.UNUSED_KEY_THRESHOLD_DAYS || '30'),
  senderEmail: process.env.SENDER_EMAIL!,
  dryRun: process.env.DRY_RUN === 'false',
};

// ─── Action Types ───
type KeyAction = 'unused_delete' | 'delete' | 'deactivate' | 'rotate' | 'none';

// ─── Determine what action to take on a key ───
//
//  Timeline for an active key:
//  ├─ Day 0:   Key created
//  ├─ Day 90:  CREATE new key → old key still works (user has 10 days to switch)
//  ├─ Day 100: DEACTIVATE old key → forces switch (can reactivate in emergency)
//  └─ Day 110: DELETE old key → permanently gone
//
//  Timeline for an unused key:
//  ├─ Day 0:   Key created
//  └─ Day 30:  DELETE key → never used, security risk
//
function determineKeyAction(key: AccessKeyInfo, keyAge: number, keyNeverUsed: boolean): KeyAction {
  // Priority 1: Never-used keys past threshold then delete immediately
  if (keyNeverUsed && keyAge >= config.unusedKeyThresholdDays) return 'unused_delete';

  // Priority 2: Inactive keys past deletion threshold then permanently delete
  if (keyAge >= config.deletionDays && key.status === 'Inactive') return 'delete';

  // Priority 3: Active keys past deactivation threshold then deactivate old key
  if (keyAge >= config.deactivationDays && key.status === 'Active') return 'deactivate';

  // Priority 4: Active keys past rotation threshold then create new key
  if (keyAge >= config.rotationDays && key.status === 'Active') return 'rotate';

  return 'none';
}

// ─── Execute the determined action ───
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
      Logger.warning(`Key ${key.accessKeyId} for user ${username} has never been used (${keyAge} days old)`);
      return handleUnusedKeyDeletion(username, key.accessKeyId, keyAge);

    case 'delete':
      return handleKeyDeletion(username, key.accessKeyId, userEmail);

    case 'deactivate':
      return handleKeyDeactivation(username, key.accessKeyId, userEmail);

    case 'rotate':
      return handleKeyRotation(username, key.accessKeyId, userEmail);

    case 'none':
      Logger.debug(`Key ${key.accessKeyId} for user ${username} — no action needed`, {
        keyAge,
        status: key.status,
        lastUsed: lastUsedDate?.toISOString() ?? 'never',
      });
      return null;
  }
}

// ─── Update summary counters based on result ───
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

// ─── Main Handler ───
export const handler = async (event: any): Promise<LambdaResponse> => {
  Logger.info('Starting IAM access key rotation process', { config, dryRun: config.dryRun });

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
    const users = await iamService.listIamUsers();
    summary.totalUsers = users.length;
    Logger.info(`Processing ${users.length} IAM users`);

    for (const user of users) {
      const username = user.UserName!;

      try {
        const userEmail = await iamService.getUserEmail(username) || config.senderEmail;
        const accessKeys = await iamService.listAccessKeys(username);

        if (accessKeys.length === 0) {
          Logger.debug(`User ${username} has no access keys, skipping`);
          continue;
        }

        for (const key of accessKeys) {
          const keyAge = calculateKeyAge(key.createDate);
          const lastUsedDate = await iamService.getAccessKeyLastUsed(key.accessKeyId);
          const keyNeverUsed = lastUsedDate === null;

          let action = determineKeyAction(key, keyAge, keyNeverUsed);

          // Skip rotation if user already has 2 keys — rotation was already done
          if (action === 'rotate' && accessKeys.length >= 2) {
            Logger.info(`User ${username} already has ${accessKeys.length} keys — skipping rotation`);
            action = 'none';
          }

          const result = await executeKeyAction(action, username, key, keyAge, userEmail, lastUsedDate);

          if (result) {
            results.push(result);
            updateSummary(summary, result);
          }
        }
      } catch (error) {
        Logger.error(`Error processing user ${username}`, error);
        const errorResult: RotationResult = {
          userName: username,
          action: 'error',
          message: (error as Error).message,
        };
        results.push(errorResult);
        updateSummary(summary, errorResult);
        await sesService.sendErrorEmail(username, (error as Error).message);
      }
    }

    Logger.info('IAM access key rotation process completed', { summary, results });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'IAM access key rotation completed successfully', summary, results }),
      summary,
    };
  } catch (error) {
    Logger.error('Fatal error in IAM access key rotation process', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'IAM access key rotation failed', error: (error as Error).message }),
      summary,
    };
  }
};

// ─── Handler: Rotate Key (Day 90) ───
// Creates a new key and stores it in Secrets Manager. Old key STAYS ACTIVE for 10 more days.
async function handleKeyRotation(
  username: string,
  oldKeyId: string,
  userEmail: string
): Promise<RotationResult> {
  try {
    Logger.info(`[${config.dryRun ? 'DRY RUN' : 'LIVE'}] Rotating key for user ${username}`, { oldKeyId });

    if (config.dryRun) {
      return {
        userName: username,
        action: 'created',
        oldKeyId,
        message: '[DRY RUN] Would create new access key (old key stays active for 10 days)',
      };
    }

    // Create new access key (user keeps old key active for transition period)
    // Note: We only reach here when user has exactly 1 key (checked in determineKeyAction)
    const newKey = await iamService.createAccessKey(username);

    // Store new key in Secrets Manager
    await secretsService.storeAccessKey(username, newKey.accessKeyId, newKey.secretAccessKey, oldKeyId);

    // Send notification email — user has 10 days to switch
    const deactivationDate = addDays(new Date(), config.deactivationDays - config.rotationDays);
    await sesService.sendRotationEmail(username, userEmail, oldKeyId, newKey.accessKeyId, deactivationDate);

    Logger.info(`Successfully rotated key for user ${username}`, { oldKeyId, newKeyId: newKey.accessKeyId });

    return {
      userName: username,
      action: 'created',
      oldKeyId,
      newKeyId: newKey.accessKeyId,
      message: 'New key created and stored in Secrets Manager. Old key still active for 10 days.',
    };
  } catch (error) {
    Logger.error(`Error rotating key for user ${username}`, error);
    return { userName: username, action: 'error', oldKeyId, message: (error as Error).message };
  }
}

// ─── Handler: Deactivate Key (Day 100) ───
// Old key is disabled. User must switch to new key now.
async function handleKeyDeactivation(
  username: string,
  keyId: string,
  userEmail: string
): Promise<RotationResult> {
  try {
    Logger.info(`[${config.dryRun ? 'DRY RUN' : 'LIVE'}] Deactivating key for user ${username}`, { keyId });

    if (config.dryRun) {
      return {
        userName: username,
        action: 'deactivated',
        oldKeyId: keyId,
        message: '[DRY RUN] Would deactivate access key',
      };
    }

    await iamService.updateAccessKeyStatus(username, keyId, 'Inactive');

    // Send warning email — key will be deleted in 10 days
    const deletionDate = addDays(new Date(), config.deletionDays - config.deactivationDays);
    await sesService.sendDeactivationEmail(username, userEmail, keyId, deletionDate);

    Logger.info(`Successfully deactivated key for user ${username}`, { keyId });

    return {
      userName: username,
      action: 'deactivated',
      oldKeyId: keyId,
      message: 'Old key deactivated. Will be permanently deleted in 10 days.',
    };
  } catch (error) {
    Logger.error(`Error deactivating key for user ${username}`, error);
    return { userName: username, action: 'error', oldKeyId: keyId, message: (error as Error).message };
  }
}

// ─── Handler: Delete Key (Day 110) ───
// Old key is permanently removed.
async function handleKeyDeletion(
  username: string,
  keyId: string,
  userEmail: string
): Promise<RotationResult> {
  try {
    Logger.info(`[${config.dryRun ? 'DRY RUN' : 'LIVE'}] Deleting key for user ${username}`, { keyId });

    if (config.dryRun) {
      return {
        userName: username,
        action: 'deleted',
        oldKeyId: keyId,
        message: '[DRY RUN] Would permanently delete access key',
      };
    }

    await iamService.deleteAccessKey(username, keyId);
    await sesService.sendDeletionEmail(username, userEmail, keyId);

    Logger.info(`Successfully deleted key for user ${username}`, { keyId });

    return {
      userName: username,
      action: 'deleted',
      oldKeyId: keyId,
      message: 'Old access key permanently deleted',
    };
  } catch (error) {
    Logger.error(`Error deleting key for user ${username}`, error);
    return { userName: username, action: 'error', oldKeyId: keyId, message: (error as Error).message };
  }
}

// ─── Handler: Delete Unused Key ───
// Key was never used — likely a system-generated user. Notify support, not user.
async function handleUnusedKeyDeletion(
  username: string,
  keyId: string,
  keyAge: number
): Promise<RotationResult> {
  try {
    Logger.info(`[${config.dryRun ? 'DRY RUN' : 'LIVE'}] Deleting unused key for user ${username}`, { keyId, keyAge });

    if (config.dryRun) {
      return {
        userName: username,
        action: 'unused_deleted',
        oldKeyId: keyId,
        message: `[DRY RUN] Would delete unused key (${keyAge} days old, never used)`,
      };
    }

    await iamService.deleteAccessKey(username, keyId);
    await sesService.sendUnusedKeyDeletedEmail(username, keyId, keyAge);

    Logger.info(`Successfully deleted unused key for user ${username}`, { keyId, keyAge });

    return {
      userName: username,
      action: 'unused_deleted',
      oldKeyId: keyId,
      message: `Unused key deleted (${keyAge} days old, never used)`,
    };
  } catch (error) {
    Logger.error(`Error deleting unused key for user ${username}`, error);
    return { userName: username, action: 'error', oldKeyId: keyId, message: (error as Error).message };
  }
}
