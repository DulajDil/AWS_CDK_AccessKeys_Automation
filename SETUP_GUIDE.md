# Setup Guide

Step-by-step instructions for deploying the IAM Access Key Rotation stack.

## What This Deploys

- A Lambda function (Node.js/TypeScript) that rotates IAM access keys
- An EventBridge rule that triggers the Lambda on a schedule
- IAM permissions for the Lambda to manage keys, secrets, and emails

## Key Rotation Lifecycle

```
Day 0    — Key created
Day 90   — New key created, old key still works (user has 10 days to switch)
Day 100  — Old key deactivated (forces the switch)
Day 110  — Old key permanently deleted
```

Unused keys (never accessed after 30 days) are deleted automatically and the admin is notified.

---

## Step 1: Verify SES Email

The Lambda sends notifications via SES. You need a verified sender email.

1. Go to AWS Console > SES > Identities
2. Create and verify the email address you'll use as `SENDER_EMAIL`

If SES is in sandbox mode, you also need to verify each recipient email.

## Step 2: Bootstrap CDK

If you haven't bootstrapped CDK in this account/region yet:

```bash
npx cdk bootstrap --profile your-profile
```

## Step 3: Configure

Edit `lib/iam-access-key-rotation-stack.ts` to set your environment variables:

```typescript
environment: {
  ROTATION_DAYS: "90",
  DEACTIVATE_DAYS: "100",
  DELETION_DAYS: "110",
  UNUSED_KEY_THRESHOLD_DAYS: "30",
  SENDER_EMAIL: "your-verified-email@example.com",
  DRY_RUN: "true",  // Start with dry run
}
```

## Step 4: Test with Dry Run

Deploy with `DRY_RUN: "true"` first to see what the Lambda would do without making changes:

```bash
npm run build
npx cdk deploy --profile your-profile
```

Then trigger the Lambda manually from the AWS Console (Lambda > Test tab, empty `{}` event) and check CloudWatch Logs.

## Step 5: Go Live

Once you're happy with the dry run logs, set `DRY_RUN: "false"` and redeploy.

## Step 6: Add Email Tags to IAM Users

The Lambda looks for an `Email` tag on each IAM user to know where to send notifications. If no tag is found, it falls back to `SENDER_EMAIL`.

```bash
aws iam tag-user \
  --user-name john.doe \
  --tags Key=Email,Value=john.doe@example.com \
  --profile your-profile
```

---

## Testing

Run the test suite:

```bash
npm test
```

This runs 60 tests covering the action logic, Lambda handler, date utilities, and CDK stack.

---

## Monitoring

### CloudWatch Logs Insights

Summary of all rotations:

```
fields @timestamp, summary.keysRotated, summary.keysDeactivated, summary.keysDeleted
| filter @message like /rotation completed/
| sort @timestamp desc
```

Find errors:

```
fields @timestamp, userName, message
| filter level = "ERROR"
| sort @timestamp desc
```

Track a specific user:

```
fields @timestamp, action, message
| filter userName = "your-username"
| sort @timestamp desc
```

---

## Troubleshooting

**Lambda fails with IAM permission error**
- Check the Lambda execution role has the correct permissions
- Review the IAM policies in `lib/iam-access-key-rotation-stack.ts`

**Emails not sending**
- Make sure the sender email is verified in SES
- If in SES sandbox mode, recipient emails must also be verified
- Check CloudWatch Logs for SES errors

**Keys not appearing in Secrets Manager**
- Confirm the Lambda has `secretsmanager:CreateSecret` and `secretsmanager:TagResource` permissions
- Secrets are stored as `iam-access-key/{username}`

**Lambda keeps creating new keys every run**
- This was a known issue that's been fixed. The Lambda now skips rotation if the user already has 2 keys.

---

## Useful Commands

```bash
# Build
npm run build

# Run tests
npm test

# Preview changes
npx cdk diff --profile your-profile

# Deploy
npx cdk deploy --profile your-profile

# View Lambda logs
aws logs tail /aws/lambda/IamAccessKeyRotationStack-AccessKeyRotationFunction --follow --profile your-profile

# Invoke Lambda manually
aws lambda invoke \
  --function-name IamAccessKeyRotationStack-AccessKeyRotationFunction \
  --profile your-profile \
  response.json

# Tear down
npx cdk destroy --profile your-profile
```
