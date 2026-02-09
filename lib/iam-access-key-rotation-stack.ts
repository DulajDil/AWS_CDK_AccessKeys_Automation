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

    // 1. Define the Lambda Function  
    const rotationFunction = new lambdaNodejs.NodejsFunction(this, "AccessKeyRotationFunction", {
      entry: "lambda/access_key_rotation/index.ts",
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],  // AWS SDK v3 is available in Lambda runtime
        forceDockerBundling: false,  // Use local bundling instead of Docker
      },
      environment: {
        ENV: process.env.ENV || 'dev',
        ROTATION_DAYS: "90",
        DEACTIVATE_DAYS: "100",
        DELETION_DAYS: "110",
        UNUSED_KEY_THRESHOLD_DAYS: "30",  // Delete keys that are 30+ days old and never used
        SENDER_EMAIL: `connect.${process.env.ENV || 'prd'}@notifications.nanoputian.io`,
        DRY_RUN: "false",
      },
    });

    //2. Give the Lambda fucntion permission store and access the IAM
    rotationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'iam:ListUsers',
        'iam:ListAccessKeys',
        'iam:GetAccessKeyLastUsed',  // Added for checking if key was ever used
        'iam:CreateAccessKey',
        'iam:DeleteAccessKey',
        'iam:UpdateAccessKey',
        'iam:GetUser',
      ],
      resources: ['*'],
    }));

    // 3. Give Lambda permissions for Secrets Manager
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

    // 4. Give Lambda permissions to send emails via SES
    rotationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: ['*'],
    }));

    //5. Create the EventBridge rule to trigger the Lambda function
    const rule = new events.Rule(this, 'DailyRotationRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '10' }),
      description: 'Triggers IAM access key rotation check daily at 10am UTC',
    })

    //6. connect the rule to the Lambda function
    rule.addTarget(new targets.LambdaFunction(rotationFunction));

    //7 Output the lambda function Name 
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: rotationFunction.functionName,
      description: 'Name of the Lambda function',
    })
  }
}
