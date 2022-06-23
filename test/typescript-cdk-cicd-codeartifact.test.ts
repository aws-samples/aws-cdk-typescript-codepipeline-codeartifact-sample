// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as TypescriptCdkCicdCodeartifact from '../lib/typescript-cdk-cicd-codeartifact-stack';

test('CodeCommit repo created', () => {
  const app = new cdk.App();
    // WHEN
  const stack = new TypescriptCdkCicdCodeartifact.TypescriptCdkCicdCodeartifactStack(app, 'TypescriptCdkCicdCodeartifactStack');
    // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeCommit::Repository', {
      RepositoryName: "TypeScriptSampleRepository"
  });
});
