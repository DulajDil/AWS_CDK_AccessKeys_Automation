import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { IamAccessKeyRotationStack } from '../../lib/iam-access-key-rotation-stack';

describe('IamAccessKeyRotationStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new IamAccessKeyRotationStack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
  });

  // ─── Lambda Function ───
  describe('Lambda Function', () => {
    it('should create exactly 1 Lambda function', () => {
      template.resourceCountIs('AWS::Lambda::Function', 1);
    });

    it('should use Node.js 20 runtime', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
      });
    });

    it('should set memory size to 512 MB', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 512,
      });
    });

    it('should set timeout to 10 seconds', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 10,
      });
    });

    it('should have ENV environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            ENV: 'dev',
          }),
        },
      });
    });

    it('should have ROTATION_DAYS environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            ROTATION_DAYS: '90',
          }),
        },
      });
    });

    it('should have DRY_RUN environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            DRY_RUN: 'false',
          }),
        },
      });
    });
  });

  // ─── EventBridge Rule ───
  describe('EventBridge Rule', () => {
    it('should create exactly 1 EventBridge rule', () => {
      template.resourceCountIs('AWS::Events::Rule', 1);
    });

    it('should be enabled', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        State: 'ENABLED',
      });
    });
  });

  // ─── IAM Policy ───
  describe('IAM Permissions', () => {
    it('should create an IAM policy for the Lambda role', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['iam:ListUsers']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('should include GetAccessKeyLastUsed permission', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['iam:GetAccessKeyLastUsed']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('should include Secrets Manager permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['secretsmanager:CreateSecret']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('should include TagResource permission for Secrets Manager', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['secretsmanager:TagResource']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('should include SES permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['ses:SendEmail']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  // ─── Outputs ───
  describe('Stack Outputs', () => {
    it('should output the Lambda function name', () => {
      template.hasOutput('LambdaFunctionName', {
        Description: 'Name of the Lambda function',
      });
    });
  });
});
