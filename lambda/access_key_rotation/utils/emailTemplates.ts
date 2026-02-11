/**
 * HTML email templates used by the SES service.
 *
 * Each template is a function that accepts dynamic values and returns an
 * HTML string. The templates are intentionally kept simple so they render
 * well in most email clients.
 */

/** Prefix used to namespace secrets in AWS Secrets Manager. */
export const SECRET_NAME_PREFIX = 'iam-access-key';

export const EMAIL_TEMPLATES = {

  /** Sent when a new key is created (rotation). Tells the user how to retrieve it. */
  ROTATION: (username: string, oldKeyId: string, newKeyId: string, deactivationDate: string) => `
      <h2>IAM Access Key Rotated</h2>
      <p>Hello,</p>
      <p>Your IAM access key has been automatically rotated.</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Old Key ID:</strong> ${oldKeyId}</li>
        <li><strong>New Key ID:</strong> ${newKeyId}</li>
        <li><strong>Old Key Deactivation Date:</strong> ${deactivationDate}</li>
      </ul>
      <p><strong>Action Required:</strong></p>
      <ol>
        <li>Retrieve the new access key from AWS Secrets Manager: <code>${SECRET_NAME_PREFIX}/${username}</code></li>
        <li>Update your applications/scripts with the new credentials</li>
        <li>Test the new credentials</li>
      </ol>
      <p><strong>Important:</strong> Your old key (${oldKeyId}) will be deactivated on ${deactivationDate}.</p>
      <p>If you need assistance, please contact your AWS support team.</p>
    `,

  /** Sent when an old key is deactivated. Warns about upcoming deletion. */
  DEACTIVATION: (username: string, keyId: string, deletionDate: string) => `
      <h2>IAM Access Key Deactivation Warning</h2>
      <p>Hello,</p>
      <p>Your IAM access key has been deactivated as it exceeded 100 days.</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Key ID:</strong> ${keyId}</li>
        <li><strong>Deletion Date:</strong> ${deletionDate}</li>
      </ul>
      <p><strong>Action Required:</strong> If you haven't already, please retrieve your new access key from AWS Secrets Manager.</p>
      <p><strong>Warning:</strong> This key will be permanently deleted on ${deletionDate}.</p>
    `,

  /** Sent when an old key is permanently deleted. */
  DELETION: (username: string, keyId: string) => `
      <h2>IAM Access Key Deleted</h2>
      <p>Hello,</p>
      <p>Your old IAM access key has been permanently deleted.</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Deleted Key ID:</strong> ${keyId}</li>
      </ul>
      <p>Please ensure you are using the new credentials from AWS Secrets Manager.</p>
    `,

  /** Sent to admin when an unused key is automatically deleted. */
  UNUSED_KEY_DELETED: (username: string, keyId: string, keyAge: number) => `
      <h2>Unused IAM Access Key Deleted</h2>
      <p>Hello Support Team,</p>
      <p>An unused IAM access key has been automatically deleted.</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Key ID:</strong> ${keyId}</li>
        <li><strong>Key Age:</strong> ${keyAge} days</li>
        <li><strong>Reason:</strong> Key was created but never used</li>
      </ul>
      <p><strong>Note:</strong> This is likely a system-generated user. The key was deleted as a security precaution.</p>
      <p>If this user requires access keys, new keys can be generated and properly distributed.</p>
    `,

  /** Sent to admin when an error occurs while processing a user's keys. */
  ERROR: (username: string, error: string) => `
      <h2>IAM Access Key Rotation Error</h2>
      <p>Hello,</p>
      <p>An error occurred while processing your IAM access key.</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Error:</strong> ${error}</li>
      </ul>
      <p>Please contact your AWS support team for assistance.</p>
    `,
};
