# IAM Access Key Rotation

Automated IAM access key rotation for a single AWS account, built with AWS CDK.

Uses Lambda, EventBridge, Secrets Manager, and SES to handle the full key lifecycle: rotation, deactivation, deletion, and unused key cleanup.

## Quick Start

```bash
npm install
npm run build
npm test
npx cdk deploy --profile your-profile
```

## Commands

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm run test` | Run unit tests (60 tests) |
| `npx cdk synth` | Generate CloudFormation template |
| `npx cdk diff` | Preview changes before deploying |
| `npx cdk deploy` | Deploy the stack |
| `npx cdk destroy` | Tear down the stack |

## How It Works

The Lambda runs on a schedule and checks every IAM user's access keys:

| Key Age | Status | Action |
|---|---|---|
| < 90 days | Active | Nothing |
| 90+ days | Active (1 key) | Create new key, store in Secrets Manager, email user |
| 100+ days | Active | Deactivate old key, email warning |
| 110+ days | Inactive | Delete old key, email confirmation |
| 30+ days | Never used | Delete unused key, notify admin |

If a user already has 2 keys, rotation is skipped — it was already done in a previous run.

## Configuration

Environment variables are defined in `lib/iam-access-key-rotation-stack.ts`:

- `ROTATION_DAYS` — when to create a new key (default: 90)
- `DEACTIVATION_DAYS` — when to deactivate the old key (default: 100)
- `DELETION_DAYS` — when to delete the old key (default: 110)
- `UNUSED_KEY_THRESHOLD_DAYS` — when to delete never-used keys (default: 30)
- `SENDER_EMAIL` — verified SES email for notifications
- `DRY_RUN` — set to `true` to log without making changes

## Prerequisites

- AWS CLI configured with a profile
- CDK bootstrapped in the target account/region
- SES sender email verified
- Node.js 20+

## Project Structure

```
├── bin/                          # CDK app entry point
├── lib/                          # CDK stack definition
├── lambda/access_key_rotation/   # Lambda function code
│   ├── index.ts                  # Handler
│   ├── services/                 # IAM, Secrets Manager, SES
│   ├── utils/                    # Logging, dates, email templates
│   └── types/                    # TypeScript interfaces
└── test/                         # Unit tests
    ├── lambda/                   # Handler and action logic tests
    ├── stack/                    # CDK stack tests
    └── utils/                    # Utility tests
```
