#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AppsyncSubEventbridgeStack } from "../lib/appsync-sub-eventbridge-stack";

const app = new cdk.App();
new AppsyncSubEventbridgeStack(app, "AppsyncSubEventbridgeStack", {
  synthesizer: new cdk.DefaultStackSynthesizer({
    qualifier: "ebsub"
  })
});
