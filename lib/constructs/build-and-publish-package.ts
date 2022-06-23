// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import {Construct} from "constructs";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import {Effect, Policy, PolicyStatement} from "aws-cdk-lib/aws-iam";

export interface BuildProjectProps {
  projectName: string;
  codeArtifactDomainArn: string;
  codeArtifactNpmRepoArn: string;
  artifactBucketEncryptionKey: any;
}

export class BuildAndPublishPackage extends Construct {
  public readonly project: codebuild.PipelineProject;

  constructor(scope: Construct, id: string, props: BuildProjectProps) {
    super(scope, id);

    this.project = new codebuild.PipelineProject(this, props.projectName, {
      environment: {
        computeType: codebuild.ComputeType.MEDIUM,
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      encryptionKey: props.artifactBucketEncryptionKey,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "aws codeartifact login --tool npm --repository npm --domain aws-typescript-sample-domain",
              "npm install -g typescript"
            ],
          },
          build: {
            commands: [
              `cd packages/${props.projectName}`,
              "tsc",
              "npm publish"
            ]
          },
        },
      }),
    });

    this.project.role?.attachInlinePolicy(
        new Policy(this, `${props.projectName}codeArtifactPolicy`, {
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
              resources: [props.codeArtifactDomainArn],
              actions: ["codeartifact:GetAuthorizationToken"]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: [props.codeArtifactNpmRepoArn],
              actions: [
                "codeartifact:ReadFromRepository",
                "codeartifact:GetRepositoryEndpoint",
                "codeartifact:List*"
              ]
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              resources: ["*"],
              actions: [
                "codeartifact:PublishPackageVersion"
              ]
            }),
          ]
        })
    );
  }
}
