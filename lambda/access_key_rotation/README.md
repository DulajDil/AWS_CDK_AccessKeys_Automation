# Lambda - IAM Access Key Rotation

This is the Lambda function source code. It handles automated IAM access key rotation based on key age.

For full documentation, setup instructions, and configuration details, see the [main README](../../README.md).

## Local Development

The Lambda code is bundled automatically by CDK using esbuild. No manual build step is needed.

To install dependencies locally for IDE support:

```bash
cd lambda/access_key_rotation
npm install
```

## Notes

- Uses AWS SDK v3 clients (tree-shakeable, smaller bundle)
- CDK's `NodejsFunction` excludes the AWS SDK from the bundle since it's already in the Lambda runtime
- All logs are structured JSON for CloudWatch Insights queries
