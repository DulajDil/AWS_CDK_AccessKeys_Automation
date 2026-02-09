# IAM Access Key Rotation - Complete Setup Guide

## 🎉 What You've Built

A complete AWS CDK project that automatically rotates IAM access keys using:
- **Lambda Function** (Node.js/TypeScript) - Does the actual rotation work
- **EventBridge Rule** - Triggers Lambda daily at 10 AM UTC
- **Secrets Manager** - Stores new access keys securely
- **SES** - Sends email notifications
- **IAM Roles** - Proper permissions for Lambda

---

## 📁 Project Structure

```
iam-access-key-rotation/
├── bin/
│   └── iam-access-key-rotation.ts          # CDK app entry point
├── lib/
│   └── iam-access-key-rotation-stack.ts    # CDK stack definition (infrastructure)
├── lambda/
│   └── access_key_rotation/
│       ├── index.ts                        # Main Lambda handler
│       ├── services/
│       │   ├── iamService.ts              # IAM operations
│       │   ├── secretsService.ts          # Secrets Manager operations
│       │   └── sesService.ts              # Email notifications
│       ├── utils/
│       │   ├── constants.ts               # Email templates & constants
│       │   ├── dateUtils.ts               # Date calculations
│       │   └── logger.ts                  # Structured logging
│       ├── types/
│       │   └── interfaces.ts              # TypeScript interfaces
│       ├── package.json                   # Lambda dependencies
│       └── tsconfig.json                  # Lambda TypeScript config
├── test/
│   └── iam-access-key-rotation.test.ts    # Unit tests
├── package.json                            # CDK dependencies
├── tsconfig.json                          # CDK TypeScript config
└── cdk.json                               # CDK configuration
```

---

## 🔄 How It Works

### Daily Workflow:

1. **EventBridge triggers Lambda** at 10 AM UTC every day
2. **Lambda lists all IAM users** in the account
3. **For each user's access keys**, Lambda checks the age:

   - **< 90 days**: ✅ No action (key is still fresh)
   
   - **90-99 days**: 🔄 **ROTATION**
     - Creates new access key
     - Stores in Secrets Manager: `iam-access-key/{username}`
     - Sends email: "New key created, retrieve from Secrets Manager"
   
   - **100-109 days**: ⚠️ **DEACTIVATION**
     - Deactivates old key (stops working)
     - Sends email: "Old key deactivated, will be deleted in 10 days"
   
   - **110+ days**: 🗑️ **DELETION**
     - Permanently deletes old key
     - Sends email: "Old key deleted"

4. **CloudWatch Logs** capture all activity for auditing

---

## ⚙️ Configuration (Already Set in Your Stack)

```typescript
environment: {
  ROTATION_DAYS: "30",        // Creates new key at 30 days (you set this)
  DEACTIVATE_DAYS: "100",     // Deactivates old key at 100 days
  DELETION_DAYS: "110",       // Deletes key at 110 days
  SENDER_EMAIL: "support@nanoputian.io",    // SES verified email
  DRY_RUN: "false",          // Set to "true" for testing without changes
}
```

---

## 🚀 Next Steps to Deploy

### Step 1: Verify SES Email

Your Lambda will send emails via SES. You need to verify your email:

```bash
# Go to AWS Console > SES > Email Addresses > Verify a New Email Address
# Verify: support@nanoputian.io
```

If you're in SES Sandbox mode, you'll also need to verify recipient emails.

### Step 2: Bootstrap CDK (if not done)

```bash
export AWS_PROFILE=hitman
cdk bootstrap
```

### Step 3: Build and Deploy

```bash
# From project root
npm run build

# Review what will be created
npx cdk synth

# Preview changes
npx cdk diff --profile hitman

# Deploy!
npx cdk deploy --profile hitman
```

### Step 4: Test in DRY RUN Mode First

Before going live, test with DRY_RUN enabled:

1. Update stack to set `DRY_RUN: "true"`
2. Deploy
3. Manually invoke Lambda from AWS Console
4. Check CloudWatch Logs to see what would happen
5. Verify emails are sent
6. Once confident, set `DRY_RUN: "false"` and redeploy

---

## 🧪 Testing

### Manual Lambda Invocation:

1. Go to AWS Console > Lambda > AccessKeyRotationFunction
2. Click "Test" tab
3. Create a test event (empty JSON `{}` is fine)
4. Click "Test" button
5. Check CloudWatch Logs for output

### Check CloudWatch Logs:

```bash
# View logs
aws logs tail /aws/lambda/IamAccessKeyRotationStack-AccessKeyRotationFunction --follow --profile hitman
```

---

## 📊 Monitoring

### CloudWatch Logs Insights Queries:

**Summary of all rotations:**
```
fields @timestamp, summary.keysRotated, summary.keysDeactivated, summary.keysDeleted
| filter @message like /rotation completed/
| sort @timestamp desc
```

**Find errors:**
```
fields @timestamp, userName, message
| filter level = "ERROR"
| sort @timestamp desc
```

**Track specific user:**
```
fields @timestamp, action, message
| filter userName = "your-username"
| sort @timestamp desc
```

---

## 🔐 Security Best Practices

✅ **Implemented in your code:**
- Least privilege IAM permissions
- Secrets stored in AWS Secrets Manager
- Structured logging (no sensitive data in logs)
- Email notifications at each stage
- Dry run mode for testing
- Admin error notifications

---

## 📝 Important Notes

### IAM User Email Tags

The Lambda tries to get user emails from IAM user tags. To add email tags:

```bash
aws iam tag-user \
  --user-name john.doe \
  --tags Key=Email,Value=john.doe@nanoputian.io \
  --profile hitman
```

If no email tag exists, it uses `SENDER_EMAIL` as fallback.

### Access Key Limit

AWS allows maximum **2 access keys per user**. If a user already has 2 keys, the Lambda will skip rotation and log a warning.

### Exempting Users

To exempt specific users from rotation (like service accounts), you can modify the Lambda code to check for a specific tag or group membership.

---

## 🐛 Troubleshooting

### Lambda fails with IAM permission error
- Check Lambda execution role has correct IAM permissions
- Verify the IAM policies in your CDK stack

### Emails not sending
- Verify sender email in SES
- Check SES is out of sandbox mode (or verify recipient emails)
- Check CloudWatch Logs for SES errors

### Keys not appearing in Secrets Manager
- Check Lambda has `secretsmanager:CreateSecret` permission
- Verify secret naming: `iam-access-key/{username}`
- Check CloudWatch Logs for Secrets Manager errors

---

## 📚 Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
- [Amazon SES](https://docs.aws.amazon.com/ses/)

---

## 🎯 Quick Commands Cheat Sheet

```bash
# Build
npm run build

# Synthesize CloudFormation
npx cdk synth

# Show what will change
npx cdk diff --profile hitman

# Deploy
npx cdk deploy --profile hitman

# Destroy (cleanup)
npx cdk destroy --profile hitman

# View Lambda logs
aws logs tail /aws/lambda/IamAccessKeyRotationStack-AccessKeyRotationFunction --follow --profile hitman

# Invoke Lambda manually
aws lambda invoke \
  --function-name IamAccessKeyRotationStack-AccessKeyRotationFunction \
  --profile hitman \
  response.json
```

---

## ✅ Deployment Checklist

- [ ] SES sender email verified
- [ ] AWS profile configured (`hitman`)
- [ ] CDK bootstrapped
- [ ] Code built successfully (`npm run build`)
- [ ] Test with `DRY_RUN: "true"` first
- [ ] Deploy to AWS
- [ ] Manually test Lambda function
- [ ] Verify CloudWatch Logs
- [ ] Verify email notifications work
- [ ] Set `DRY_RUN: "false"` for production
- [ ] Add email tags to IAM users (optional)
- [ ] Set up CloudWatch alarms (optional)

---

**You're all set!** Your Lambda code is complete and production-ready. 🚀
