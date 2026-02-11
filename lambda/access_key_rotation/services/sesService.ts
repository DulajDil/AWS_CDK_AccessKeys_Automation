/**
 * SES Service — Sends email notifications to users and admins.
 *
 * Each key lifecycle event (rotate, deactivate, delete, unused-delete,
 * error) has a dedicated send function that formats the correct template
 * and delivers it via Amazon SES.
 *
 * Email failures are caught and logged but never propagated — a failed
 * notification should not block the rotation process.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Logger } from '../utils/logger';
import { EMAIL_SUBJECTS } from '../utils/constants';
import { EMAIL_TEMPLATES } from '../utils/emailTemplates';
import { formatDateForEmail } from '../utils/dateUtils';

/** Shared SES client — reused across invocations. */
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

/** Verified sender address (set via environment variable). */
const senderEmail = process.env.SENDER_EMAIL!;

// ---------------------------------------------------------------------------
// Public send helpers
// ---------------------------------------------------------------------------

/** Notify the user that their key has been rotated and a new key is available. */
export async function sendRotationEmail(
  username: string,
  userEmail: string,
  oldKeyId: string,
  newKeyId: string,
  deactivationDate: Date,
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.ROTATION(
      username, oldKeyId, newKeyId, formatDateForEmail(deactivationDate),
    );
    await sendEmail(userEmail, EMAIL_SUBJECTS.ROTATION, htmlBody);
    Logger.info(`Rotation notification sent to ${userEmail} for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to send rotation email for user ${username}`, error);
  }
}

/** Warn the user that their old key has been deactivated. */
export async function sendDeactivationEmail(
  username: string,
  userEmail: string,
  keyId: string,
  deletionDate: Date,
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.DEACTIVATION(
      username, keyId, formatDateForEmail(deletionDate),
    );
    await sendEmail(userEmail, EMAIL_SUBJECTS.DEACTIVATION, htmlBody);
    Logger.info(`Deactivation notification sent to ${userEmail} for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to send deactivation email for user ${username}`, error);
  }
}

/** Inform the user that their old key has been permanently deleted. */
export async function sendDeletionEmail(
  username: string,
  userEmail: string,
  keyId: string,
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.DELETION(username, keyId);
    await sendEmail(userEmail, EMAIL_SUBJECTS.DELETION, htmlBody);
    Logger.info(`Deletion notification sent to ${userEmail} for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to send deletion email for user ${username}`, error);
  }
}

/** Notify the admin that an unused key was automatically deleted. */
export async function sendUnusedKeyDeletedEmail(
  username: string,
  keyId: string,
  keyAge: number,
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.UNUSED_KEY_DELETED(username, keyId, keyAge);
    await sendEmail(senderEmail, EMAIL_SUBJECTS.UNUSED_KEY_DELETED, htmlBody);
    Logger.info(`Unused-key deletion notification sent to admin for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to send unused-key deletion email for user ${username}`, error);
  }
}

/** Notify the admin about a per-user processing error. */
export async function sendErrorEmail(
  username: string,
  errorMessage: string,
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.ERROR(username, errorMessage);
    await sendEmail(senderEmail, EMAIL_SUBJECTS.ERROR, htmlBody);
    Logger.info(`Error notification sent to admin for user ${username}`);
  } catch (error) {
    Logger.error(`Failed to send error email for user ${username}`, error);
  }
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Low-level send via SES. All public functions delegate here so that
 * email construction is consistent.
 */
async function sendEmail(
  toAddress: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  const command = new SendEmailCommand({
    Source: senderEmail,
    Destination: { ToAddresses: [toAddress] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } },
    },
  });

  await sesClient.send(command);
}
