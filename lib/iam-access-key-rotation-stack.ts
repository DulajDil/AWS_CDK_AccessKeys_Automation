/**
 * CDK Stack — Defines the AWS infrastructure for the IAM access key
 * rotation solution.
 *
 * Resources created:
 *   1. A Node.js Lambda function that performs key rotation logic.
 *   2. IAM policies granting the Lambda access to IAM, Secrets Manager, and SES.
 *   3. An EventBridge rule that triggers the Lambda daily at 10 AM UTC.
 */

import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration } from 'aws-cdk-lib/core';

export class IamAccessKeyRotationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── 1. Lambda Function ──────────────────────────────────────────────
    // Bundles the TypeScript source with esbuild; AWS SDK v3 is provided
    // by the Lambda runtime so it is excluded from the bundle.
    const rotationFunction = new lambdaNodejs.NodejsFunction(this, 'AccessKeyRotationFunction', {
      entry: 'lambda/access_key_rotation/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
      environment: {
        ENV: process.env.ENV || 'dev',
        ROTATION_DAYS: '90',
        DEACTIVATE_DAYS: '100',
        DELETION_DAYS: '110',
        UNUSED_KEY_THRESHOLD_DAYS: '30',
        SENDER_EMAIL: 'example@domain.com',
        DRY_RUN: 'false',
      },
    });

    // ── 2. IAM permissions ──────────────────────────────────────────────
    // Allow the Lambda to list users and manage their access keys.
    rotationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'iam:ListUsers',
        'iam:ListAccessKeys',
        'iam:GetAccessKeyLastUsed',
        'iam:CreateAccessKey',
        'iam:DeleteAccessKey',
        'iam:UpdateAccessKey',
        'iam:GetUser',
      ],
      resources: ['*'],
    }));

    // ── 3. Secrets Manager permissions ──────────────────────────────────
    // Allow the Lambda to create/update/read secrets for rotated keys.
    rotationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:CreateSecret',
        'secretsmanager:UpdateSecret',
        'secretsmanager:PutSecretValue',
        'secretsmanager:GetSecretValue',
        'secretsmanager:TagResource',
      ],
      resources: ['*'],
    }));

    // ── 4. SES permissions ──────────────────────────────────────────────
    // Allow the Lambda to send notification emails via SES.
    rotationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: ['*'],
    }));

    // ── 5. EventBridge schedule ─────────────────────────────────────────
    // Run the rotation check once a day at 10:00 AM UTC.
    const rule = new events.Rule(this, 'DailyRotationRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '10' }),
      description: 'Triggers IAM access key rotation check daily at 10 AM UTC',
    });

    // ── 6. Connect the schedule to the Lambda ───────────────────────────
    rule.addTarget(new targets.LambdaFunction(rotationFunction));

    // ── 7. Stack output ─────────────────────────────────────────────────
    // Export the function name so it can be referenced by other stacks or scripts.
    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: rotationFunction.functionName,
      description: 'Name of the IAM access key rotation Lambda function',
    });
  }
}
