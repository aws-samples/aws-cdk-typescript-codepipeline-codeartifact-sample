# TypeScript CDK CodeArtifact Package Publishing

This pattern shows you how to create a pipeline that will automatically publish new TypeScript package versions to private AWS CodeArtifact repository using AWS CodePipeline.

For the purpose of demonstrating the workflow sample package code is included as part of the same repository (similar to monorepo structure) and it will be stored in AWS CodeCommit.

AWS CodeArtifact is a fully managed artifact repository service that makes it easy for organizations of any size to securely store, publish, and share software packages used in their software development process.

AWS CodePipeline is a fully managed continuous delivery service that helps you automate your release pipelines for fast and reliable application and infrastructure updates.

AWS CodeCommit is a secure, highly scalable, managed source control service that hosts private Git repositories

All resources in this pattern are provisioned as IaC with AWS CDK written in TypeScript.

This pattern can be used as a reference when getting started with CodePipeline and CodeArtifact in CDK, but also as a starting point for creating a simple implementation of a monorepo for multiple packages.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
