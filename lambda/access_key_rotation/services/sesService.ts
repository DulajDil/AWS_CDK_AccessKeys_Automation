// SES Service - Handles email notifications

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Logger } from '../utils/logger';
import { EMAIL_SUBJECTS } from '../utils/constants';
import { EMAIL_TEMPLATES } from '../utils/emailTemplates';
import { formatDateForEmail } from '../utils/dateUtils';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

const senderEmail = process.env.SENDER_EMAIL!;

export async function sendRotationEmail(
  username: string,
  userEmail: string,
  oldKeyId: string,
  newKeyId: string,
  deactivationDate: Date
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.ROTATION(
      username,
      oldKeyId,
      newKeyId,
      formatDateForEmail(deactivationDate)
    );

    await sendEmail(
      userEmail,
      EMAIL_SUBJECTS.ROTATION,
      htmlBody
    );

    Logger.info(`Sent rotation email to ${userEmail} for user ${username}`);
  } catch (error) {
    Logger.error(`Error sending rotation email for user ${username}`, error);
    // Don't throw - email failure shouldn't stop the rotation process
  }
}

export async function sendDeactivationEmail(
  username: string,
  userEmail: string,
  keyId: string,
  deletionDate: Date
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.DEACTIVATION(
      username,
      keyId,
      formatDateForEmail(deletionDate)
    );

    await sendEmail(
      userEmail,
      EMAIL_SUBJECTS.DEACTIVATION,
      htmlBody
    );

    Logger.info(`Sent deactivation email to ${userEmail} for user ${username}`);
  } catch (error) {
    Logger.error(`Error sending deactivation email for user ${username}`, error);
  }
}

export async function sendDeletionEmail(
  username: string,
  userEmail: string,
  keyId: string
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.DELETION(username, keyId);

    await sendEmail(
      userEmail,
      EMAIL_SUBJECTS.DELETION,
      htmlBody
    );

    Logger.info(`Sent deletion email to ${userEmail} for user ${username}`);
  } catch (error) {
    Logger.error(`Error sending deletion email for user ${username}`, error);
  }
}

export async function sendUnusedKeyDeletedEmail(
  username: string,
  keyId: string,
  keyAge: number
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.UNUSED_KEY_DELETED(username, keyId, keyAge);

    await sendEmail(
      senderEmail,
      EMAIL_SUBJECTS.UNUSED_KEY_DELETED,
      htmlBody
    );

    Logger.info(`Sent unused key deletion email to sender for user ${username}`);
  } catch (error) {
    Logger.error(`Error sending unused key deletion email for user ${username}`, error);
  }
}

export async function sendErrorEmail(
  username: string,
  errorMessage: string
): Promise<void> {
  try {
    const htmlBody = EMAIL_TEMPLATES.ERROR(username, errorMessage);

    await sendEmail(
      senderEmail,
      EMAIL_SUBJECTS.ERROR,
      htmlBody
    );

    Logger.info(`Sent error email to sender for user ${username}`);
  } catch (error) {
    Logger.error(`Error sending error email for user ${username}`, error);
  }
}

async function sendEmail(
  toAddress: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const command = new SendEmailCommand({
    Source: senderEmail,
    Destination: {
      ToAddresses: [toAddress],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8',
        },
      },
    },
  });

  await sesClient.send(command);
}
