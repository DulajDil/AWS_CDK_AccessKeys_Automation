# IAM Access Key Rotation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Automated IAM access key rotation for a single AWS account, built with AWS CDK.

Uses Lambda, EventBridge, Secrets Manager, and SES to handle the full key lifecycle: rotation, deactivation, deletion, and unused key cleanup.

## Table of Contents

- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Configuration](#configuration)
- [Testing](#testing)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Commands](#commands)

---

## How It Works

The Lambda runs on a schedule and checks every IAM user's access keys:

```
Day 0    — Key created
Day 90   — New key created, old key still works (user has 10 days to switch)
Day 100  — Old key deactivated (forces the switch)
Day 110  — Old key permanently deleted
```

Unused keys that have never been accessed after 30 days are deleted automatically and the admin is notified.

If a user already has 2 keys, rotation is skipped — it was already done in a previous run.

| Key Age | Status | Action |
|---|---|---|
| < 90 days | Active | Nothing |
| 90+ days | Active (1 key) | Create new key, store in Secrets Manager, email user |
| 100+ days | Active | Deactivate old key, email warning |
| 110+ days | Inactive | Delete old key, email confirmation |
| 30+ days | Never used | Delete unused key, notify admin |

---

## Project Structure

```
├── bin/                          # CDK app entry point
├── lib/                          # CDK stack definition
├── lambda/access_key_rotation/   # Lambda function code
│   ├── index.ts                  # Main handler
│   ├── services/
│   │   ├── iamService.ts         # IAM operations
│   │   ├── secretsService.ts     # Secrets Manager operations
│   │   └── sesService.ts         # Email notifications (SES)
│   ├── utils/
│   │   ├── constants.ts          # Email subjects
│   │   ├── dateUtils.ts          # Date calculations
│   │   ├── emailTemplates.ts     # HTML email templates
│   │   └── logger.ts             # Structured JSON logging
│   └── types/
│       └── interfaces.ts         # TypeScript interfaces
└── test/
    ├── lambda/                   # Handler and action logic tests
    ├── stack/                    # CDK stack tests
    └── utils/                    # Date utility tests
```

---
## Architecture

<img width="881" height="651" alt="AccessKeys_Automation" src="https://github.com/user-attachments/assets/80a7cd55-f0d9-4c6d-b293-769ca0821a82" />

---
## Prerequisites

- Node.js 20+
- AWS CLI configured with a profile
- CDK bootstrapped in the target account/region
- A verified sender email in SES

---

## Setup

### 1. Install dependencies

```bash
npm install
cd lambda/access_key_rotation && npm install && cd ../..
```

### 2. Verify your SES email

Go to AWS Console > SES > Identities and verify the email address you want to use as `SENDER_EMAIL`.

If SES is in sandbox mode, you also need to verify each recipient email address.

### 3. Bootstrap CDK

If this is the first CDK deployment in this account/region:

```bash
npx cdk bootstrap --profile your-profile
```

### 4. Configure environment variables

Edit `lib/iam-access-key-rotation-stack.ts`:

```typescript
environment: {
  ROTATION_DAYS: "90",
  DEACTIVATE_DAYS: "100",
  DELETION_DAYS: "110",
  UNUSED_KEY_THRESHOLD_DAYS: "30",
  SENDER_EMAIL: "your-verified-email@example.com",
  DRY_RUN: "true",  // start with dry run
}
```

### 5. Deploy with dry run first

```bash
npm run build
npx cdk deploy --profile your-profile
```

Trigger the Lambda manually from the AWS Console (Lambda > Test tab, empty `{}` event) and check CloudWatch Logs to see what it would do.

### 6. Go live

Once you're happy with the logs, set `DRY_RUN: "false"` and redeploy.

### 7. Add email tags to IAM users

The Lambda looks for an `Email` tag on each IAM user to know where to send notifications. If no tag exists, it falls back to `SENDER_EMAIL`.

```bash
aws iam tag-user \
  --user-name john.doe \
  --tags Key=Email,Value=john.doe@example.com \
  --profile your-profile
```

---

## Configuration

Environment variables are defined in `lib/iam-access-key-rotation-stack.ts`:

| Variable | Default | Description |
|---|---|---|
| `ROTATION_DAYS` | 90 | Days before creating a new key |
| `DEACTIVATION_DAYS` | 100 | Days before deactivating the old key |
| `DELETION_DAYS` | 110 | Days before permanently deleting the old key |
| `UNUSED_KEY_THRESHOLD_DAYS` | 30 | Days before deleting a never-used key |
| `SENDER_EMAIL` | — | Verified SES email for sending notifications |
| `DRY_RUN` | false | Set to `true` to log actions without executing them |
| `ENV` | dev | Environment name (used in resource naming) |

---

## Testing

Run all 60 tests:

```bash
npm test
```

Run a specific test file:

```bash
npx jest test/lambda/handler.test.ts
npx jest test/lambda/determineKeyAction.test.ts
npx jest test/stack/
npx jest test/utils/
```

The tests cover:
- Key action decision logic (rotate, deactivate, delete, unused)
- Lambda handler with mocked AWS services
- CDK stack resources and permissions
- Date utility functions

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
- This was a known issue that has been fixed. The Lambda now skips rotation if the user already has 2 keys.

---

## Commands

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
