# Lambda Function - IAM Access Key Rotation

This Lambda function handles automated IAM access key rotation based on key age.

## Structure

```
lambda/access_key_rotation/
├── index.ts                    # Main Lambda handler
├── package.json                # Dependencies
├── tsconfig.json              # TypeScript config
├── services/
│   ├── iamService.ts          # IAM operations
│   ├── secretsService.ts      # Secrets Manager operations
│   └── sesService.ts          # Email notifications
├── utils/
│   ├── constants.ts           # Constants and email subjects
│   ├── dateUtils.ts           # Date calculations
│   ├── emailTemplates.ts      # HTML email templates
│   └── logger.ts              # Structured logging
└── types/
    └── interfaces.ts          # TypeScript interfaces
```

## How It Works

1. EventBridge triggers the Lambda on a schedule
2. Lambda fetches all IAM users and their access keys
3. For each key, it checks the age and takes the appropriate action:
   - **< 90 days** — No action needed
   - **90+ days (1 key)** — Creates a new key, stores it in Secrets Manager, emails the user
   - **100+ days** — Deactivates the old key, emails a warning
   - **110+ days (inactive)** — Permanently deletes the old key, emails confirmation
   - **30+ days (never used)** — Deletes the unused key, notifies admin

If a user already has 2 keys, rotation is skipped (it was already done).

## Environment Variables

These are set in the CDK stack (`lib/iam-access-key-rotation-stack.ts`):

| Variable | Default | Description |
|---|---|---|
| `ROTATION_DAYS` | 90 | Days before creating a new key |
| `DEACTIVATION_DAYS` | 100 | Days before deactivating the old key |
| `DELETION_DAYS` | 110 | Days before permanently deleting the old key |
| `UNUSED_KEY_THRESHOLD_DAYS` | 30 | Days before deleting a never-used key |
| `SENDER_EMAIL` | — | Verified SES email for sending notifications |
| `DRY_RUN` | false | Set to `true` to log actions without executing them |

## Local Development

The Lambda code is bundled automatically by CDK using esbuild — no manual build step needed.

If you want to install dependencies locally (for IDE support):

```bash
cd lambda/access_key_rotation
npm install
```

## Notes

- Uses AWS SDK v3 clients (tree-shakeable, smaller bundle)
- CDK's `NodejsFunction` excludes the AWS SDK from the bundle since it's already in the Lambda runtime
- All logs are structured JSON for CloudWatch Insights queries
