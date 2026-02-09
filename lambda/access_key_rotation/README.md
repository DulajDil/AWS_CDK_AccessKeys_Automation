# Lambda Function - IAM Access Key Rotation

This Lambda function automatically rotates IAM access keys based on their age.

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
│   ├── constants.ts           # Constants and email templates
│   ├── dateUtils.ts           # Date calculations
│   └── logger.ts              # Structured logging
└── types/
    └── interfaces.ts          # TypeScript interfaces
```

## How It Works

1. **EventBridge triggers Lambda daily** at the scheduled time
2. **Lambda lists all IAM users** and their access keys
3. **For each access key**, it checks the age:
   - **90+ days**: Creates new key, stores in Secrets Manager, sends email
   - **100+ days**: Deactivates old key, sends warning email
   - **110+ days**: Permanently deletes key, sends confirmation email

## Key Features

- ✅ Automatic key rotation
- ✅ Stores new keys in AWS Secrets Manager
- ✅ Email notifications at each stage
- ✅ Dry run mode for testing
- ✅ Structured logging for CloudWatch
- ✅ Error handling and admin notifications

## Environment Variables

Set in CDK stack:
- `ROTATION_DAYS`: Days before creating new key (default: 90)
- `DEACTIVATION_DAYS`: Days before deactivating old key (default: 100)
- `DELETION_DAYS`: Days before deleting key (default: 110)
- `SENDER_EMAIL`: Verified SES email for sending notifications
- `DRY_RUN`: Set to 'true' for testing without making changes

## Installation

The Lambda code is automatically bundled by CDK using esbuild. No manual installation needed!

CDK will:
1. Bundle all TypeScript files
2. Install dependencies
3. Deploy to AWS Lambda

## Testing Locally (Optional)

If you want to test locally before deploying:

```bash
cd lambda/access_key_rotation
npm install
npm run build  # If you add a build script
```

## Notes

- AWS SDK v3 clients are used (tree-shakeable, smaller bundle size)
- CDK's NodejsFunction automatically excludes AWS SDK from bundle (already in Lambda runtime)
- Structured JSON logging for CloudWatch Insights queries
