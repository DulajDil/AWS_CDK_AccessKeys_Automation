#!/usr/bin/env node

/**
 * CDK App entry point — instantiates the IAM Access Key Rotation stack.
 *
 * The stack is deployed into the account and region implied by the current
 * AWS CLI configuration (CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION).
 */

import * as cdk from 'aws-cdk-lib/core';
import { IamAccessKeyRotationStack } from '../lib/iam-access-key-rotation-stack';

const app = new cdk.App();

new IamAccessKeyRotationStack(app, 'IamAccessKeyRotationStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
