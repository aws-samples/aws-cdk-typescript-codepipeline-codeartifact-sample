// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Repository} from 'aws-cdk-lib/aws-codecommit';
import {CfnDomain, CfnRepository} from 'aws-cdk-lib/aws-codeartifact';
import {BlockPublicAccess, Bucket, BucketEncryption} from "aws-cdk-lib/aws-s3";
import {Artifact, Pipeline} from "aws-cdk-lib/aws-codepipeline";
import {CodeBuildAction, CodeCommitSourceAction} from "aws-cdk-lib/aws-codepipeline-actions";
import {BuildSpec, ComputeType, LinuxBuildImage, PipelineProject} from "aws-cdk-lib/aws-codebuild";
import {Effect, Policy, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {BuildAndPublishPackage} from "./constructs/build-and-publish-package";
import {NagSuppressions} from "cdk-nag";


export class TypescriptCdkCicdCodeartifactStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const repo = new Repository(this, "CodeCommitRepository",{
      repositoryName:'TypeScriptSampleRepository'
    });

    const codeartifactDomain = new CfnDomain(this, "CodeArtifactDomain", {
      domainName: "aws-typescript-sample-domain"
    });

    const npmPrivateCodeartifactRepository = new CfnRepository(this, "PipPrivateCodeArtifactRepository", {
      domainName: codeartifactDomain.domainName,
      repositoryName: "npm",
      description: "Private npm repo",
      externalConnections: ["public:npmjs"]
    });

    npmPrivateCodeartifactRepository.addDependsOn(codeartifactDomain);

    const accessLogsBucket = new Bucket(this, "AccessLogsBucket", {
      bucketName: "sample-typescript-cdk-access-logs-" + this.account,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    NagSuppressions.addResourceSuppressions(accessLogsBucket,
        [
          {id: "AwsSolutions-S1", reason: "Cannot log to itself"},
        ]
    );

    const pipelineArtifactBucket = new Bucket(this, "PipelineArtifactBucket", {
      bucketName: "sample-typescript-cdk-artifact-" + this.account,
      serverAccessLogsBucket: accessLogsBucket,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const pipeline = new Pipeline(this, "PackagePipeline", {
      pipelineName: "typescript-sample-pipeline",
      restartExecutionOnUpdate: true,
      artifactBucket: pipelineArtifactBucket
    });

    const sourceOutput = new Artifact();

    const sourceAction = new CodeCommitSourceAction({
      actionName: "CodeCommit",
      repository: repo,
      output: sourceOutput,
      branch: "main"
    });

    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction]
    });

    const runUnitTestsProject = new PipelineProject(this, "RunUnitTests", {
      environment: {
        privileged: false,
        computeType: ComputeType.MEDIUM,
        buildImage: LinuxBuildImage.STANDARD_5_0
      },
      encryptionKey: pipelineArtifactBucket.encryptionKey,
      buildSpec: BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "aws codeartifact login --tool npm --repository npm --domain aws-typescript-sample-domain",
              "npm install",
            ],
          },
          build: {
            commands: ["npm run test"],
          },
        },
      })
    });

    runUnitTestsProject.role?.attachInlinePolicy(
        new Policy(this, "RunUnitTestsPolicy", {
          statements: [
              new PolicyStatement({
                effect: Effect.ALLOW,
                resources: ["*"],
                actions: ["sts:GetServiceBearerToken"],
                conditions: {
                  "StringEquals": {
                    "sts:AWSServiceName": "codeartifact.amazonaws.com"
                  }
                }
              }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: [codeartifactDomain.attrArn],
              actions: ["codeartifact:GetAuthorizationToken"]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: [npmPrivateCodeartifactRepository.attrArn],
              actions: [
                "codeartifact:ReadFromRepository",
                "codeartifact:GetRepositoryEndpoint",
                "codeartifact:List*"
              ]
            }),
          ]
        })
    );

    pipeline.addStage({
      stageName: "Test",
      actions: [
          new CodeBuildAction({
            actionName: "run-unit-tests",
            project: runUnitTestsProject,
            input: sourceOutput
          })
      ]
    });

    const selfMutateProject = new PipelineProject(this, "SelfMutate", {
      environment: {
        privileged: false,
        computeType: ComputeType.MEDIUM,
        buildImage: LinuxBuildImage.STANDARD_5_0
      },
      encryptionKey: pipelineArtifactBucket.encryptionKey,
      buildSpec: BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "aws codeartifact login --tool npm --repository npm --domain aws-typescript-sample-domain",
              "npm install",
            ],
          },
          build: {
            commands: ["npm run cdk deploy --require-approval=never"],
          },
        },
      })
    });

    selfMutateProject.role?.attachInlinePolicy(
        new Policy(this, "SelfMutatePolicy", {
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: ["*"],
              actions: ["cloudformation:DescribeStacks"]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: ["*"],
              actions: ["iam:PassRole"]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: ["arn:aws:iam::*:role/cdk-*"],
              actions: ["sts:AssumeRole"]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: ["*"],
              actions: ["sts:GetServiceBearerToken"],
              conditions: {
                "StringEquals": {
                  "sts:AWSServiceName": "codeartifact.amazonaws.com"
                }
              }
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: [codeartifactDomain.attrArn],
              actions: ["codeartifact:GetAuthorizationToken"]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: [npmPrivateCodeartifactRepository.attrArn],
              actions: [
                "codeartifact:ReadFromRepository",
                "codeartifact:GetRepositoryEndpoint",
                "codeartifact:List*"
              ]
            }),
          ]
        })
    );

    pipeline.addStage({
      stageName: "UpdatePipeline",
      actions: [
        new CodeBuildAction({
          actionName: "self-mutate",
          project: selfMutateProject,
          input: sourceOutput
        })
      ]
    });

    const samplePackageProject = new BuildAndPublishPackage(
        this,
        "BuildSamplePackage",
        {
          projectName: "sample-package",
          artifactBucketEncryptionKey: pipeline.artifactBucket.encryptionKey,
          codeArtifactDomainArn: codeartifactDomain.attrArn,
          codeArtifactNpmRepoArn: npmPrivateCodeartifactRepository.attrArn
        }
    );

    pipeline.addStage({
      stageName: "BuildAndPublishPackages",
      actions: [
        new CodeBuildAction({
          actionName: "sample-package",
          project: samplePackageProject.project,
          input: sourceOutput
        })
      ]
    });

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/PackagePipeline/Role/DefaultPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
            "Action::s3:Abort*",
            "Action::s3:DeleteObject*",
            "Action::s3:GetBucket*",
            "Action::s3:GetObject*",
            "Action::s3:List*",
            "Resource::<PipelineArtifactBucketD127CCF6.Arn>/*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/PackagePipeline/Source/CodeCommit/CodePipelineActionRole/DefaultPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Action::s3:Abort*",
          "Action::s3:DeleteObject*",
          "Action::s3:GetBucket*",
          "Action::s3:GetObject*",
          "Action::s3:List*",
          "Resource::<PipelineArtifactBucketD127CCF6.Arn>/*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/RunUnitTests/Role/DefaultPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Resource::arn:<AWS::Partition>:logs:<AWS::Region>:<AWS::AccountId>:log-group:/aws/codebuild/<RunUnitTests2AD5FFEA>:*",
          "Resource::arn:<AWS::Partition>:codebuild:<AWS::Region>:<AWS::AccountId>:report-group/<RunUnitTests2AD5FFEA>-*",
          "Action::s3:GetBucket*",
          "Action::s3:GetObject*",
          "Action::s3:List*",
          "Resource::<PipelineArtifactBucketD127CCF6.Arn>/*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/RunUnitTests/Resource", [
      {id: "AwsSolutions-CB4", reason: "False-positive. Encryption key is applied",}
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/RunUnitTestsPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Resource::*",
          "Action::codeartifact:List*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/SelfMutate/Role/DefaultPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Resource::arn:<AWS::Partition>:logs:<AWS::Region>:<AWS::AccountId>:log-group:/aws/codebuild/<SelfMutate95ADA46F>:*",
          "Resource::arn:<AWS::Partition>:codebuild:<AWS::Region>:<AWS::AccountId>:report-group/<SelfMutate95ADA46F>-*",
          "Action::s3:GetBucket*",
          "Action::s3:GetObject*",
          "Action::s3:List*",
          "Resource::<PipelineArtifactBucketD127CCF6.Arn>/*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/SelfMutate/Resource", [
      {id: "AwsSolutions-CB4", reason: "False-positive. Encryption key is applied",}
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/SelfMutatePolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Resource::*",
          "Resource::arn:aws:iam::*:role/cdk-*",
          "Action::codeartifact:List*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/BuildSamplePackage/sample-package/Role/DefaultPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Resource::arn:<AWS::Partition>:logs:<AWS::Region>:<AWS::AccountId>:log-group:/aws/codebuild/<BuildSamplePackagesamplepackageB2962058>:*",
          "Resource::arn:<AWS::Partition>:codebuild:<AWS::Region>:<AWS::AccountId>:report-group/<BuildSamplePackagesamplepackageB2962058>-*",
          "Action::s3:GetBucket*",
          "Action::s3:GetObject*",
          "Action::s3:List*",
          "Resource::<PipelineArtifactBucketD127CCF6.Arn>/*"
        ]
      }
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/BuildSamplePackage/sample-package/Resource", [
      {id: "AwsSolutions-CB4", reason: "False-positive. Encryption key is applied",}
    ]);

    NagSuppressions.addResourceSuppressionsByPath(this, "/TypescriptCdkCicdCodeartifactStack/BuildSamplePackage/sample-packagecodeArtifactPolicy/Resource", [
      {
        id: "AwsSolutions-IAM5",
        reason: "Defined by a default policy",
        appliesTo: [
          "Resource::*",
          "Action::codeartifact:List*"
        ]
      }
    ]);

  }
}
