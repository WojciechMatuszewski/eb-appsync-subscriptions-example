import * as aws_appsync from "@aws-cdk/aws-appsync-alpha";
import {
  aws_events,
  aws_events_targets,
  aws_sqs,
  CfnOutput,
  SecretValue,
  Stack,
  StackProps
} from "aws-cdk-lib";
import { Construct } from "constructs";

export class AppsyncSubEventbridgeStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const schema = new aws_appsync.Schema();

    const statusType = schema.addType(
      new aws_appsync.EnumType("Status", {
        definition: [
          "PENDING",
          "IN_PROGRESS",
          "SHIPPED",
          "DELIVERED",
          "COMPLETE"
        ]
      })
    );

    const statusUpdateType = schema.addType(
      new aws_appsync.ObjectType("StatusUpdate", {
        definition: {
          orderID: aws_appsync.GraphqlType.id({ isRequired: true }),
          status: statusType.attribute({ isRequired: true }),
          prevStatus: statusType.attribute({ isRequired: true }),
          updatedAt: aws_appsync.GraphqlType.awsDateTime({ isRequired: true })
        }
      })
    );

    schema.addMutation(
      "publishStatusUpdate",
      new aws_appsync.Field({
        returnType: statusUpdateType.attribute({ isRequired: true }),
        args: {
          orderID: aws_appsync.GraphqlType.id({ isRequired: true }),
          status: statusType.attribute({ isRequired: true }),
          prevStatus: statusType.attribute({ isRequired: true }),
          updatedAt: aws_appsync.GraphqlType.awsDateTime({ isRequired: true })
        }
      })
    );

    schema.addSubscription(
      "onStatusUpdate",
      new aws_appsync.Field({
        returnType: statusUpdateType.attribute({ isRequired: false }),
        directives: [aws_appsync.Directive.subscribe("publishStatusUpdate")]
      })
    );

    schema.addQuery(
      "__required",
      new aws_appsync.Field({
        returnType: aws_appsync.GraphqlType.boolean({ isRequired: false })
      })
    );

    const api = new aws_appsync.GraphqlApi(this, "api", {
      name: "AppSyncSubEventBridgeAPI",
      schema,
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: aws_appsync.AuthorizationType.API_KEY
        }
      }
    });

    new CfnOutput(this, "ApiKeyOutput", {
      value: api.apiKey ?? "NOT_CREATED"
    });

    const ds = new aws_appsync.NoneDataSource(this, "subscriptionDataSource", {
      api
    });

    ds.createResolver({
      fieldName: "publishStatusUpdate",
      typeName: "Mutation",
      requestMappingTemplate: aws_appsync.MappingTemplate.fromString(
        `{
          "version": "2018-05-29",
          "payload": $util.toJson($ctx.args)
        }`
      ),
      responseMappingTemplate: aws_appsync.MappingTemplate.fromString(
        `$util.toJson($ctx.result)`
      )
    });

    const bus = new aws_events.EventBus(this, "AppSyncSubEventBus", {});
    new CfnOutput(this, "BusName", {
      value: bus.eventBusName
    });

    const destination = new aws_events.ApiDestination(
      this,
      "AppSyncDestination",
      {
        connection: new aws_events.Connection(this, "AppSyncConnection", {
          authorization: aws_events.Authorization.apiKey(
            "x-api-key",
            SecretValue.resourceAttribute(api.apiKey as string)
          )
        }),
        endpoint: api.graphqlUrl,
        httpMethod: aws_events.HttpMethod.POST
      }
    );

    const debugDestination = new aws_events.ApiDestination(
      this,
      "AppSyncDebugDestination",
      {
        connection: new aws_events.Connection(this, "AppSyncDebugConnection", {
          authorization: aws_events.Authorization.apiKey(
            "x-api-key",
            SecretValue.resourceAttribute(api.apiKey as string)
          )
        }),
        endpoint: "https://webhook.site/e5b6999e-b8c9-4939-b866-d7fbb093778e",
        httpMethod: aws_events.HttpMethod.POST
      }
    );

    /**
     * See the learning notes regarding retries and DLQ.
     */
    const targetDLQ = new aws_sqs.Queue(this, "TargetDLQ", {});
    const rule = new aws_events.Rule(this, "AppSyncSubEventRule", {
      eventBus: bus,
      enabled: true,
      eventPattern: {
        source: ["orders.system"],
        detailType: ["Order Status Update"]
      },
      targets: [
        new aws_events_targets.ApiDestination(destination, {
          retryAttempts: 0,
          event: aws_events.RuleTargetInput.fromObject({
            query:
              "mutation PublishStatusUpdate($orderID:ID!, $status:Status!, $prevStatus:Status!, $updatedAt:AWSDateTime!) { publishStatusUpdate(orderID:$orderID, status:$status, prevStatus:$prevStatus, updatedAt:$updatedAt) { orderID status prevStatus updatedAt } }",
            operationName: "PublishStatusUpdate",
            variables: {
              orderID: aws_events.EventField.fromPath("$.detail.order-id"),
              status: aws_events.EventField.fromPath("$.detail.status"),
              prevStatus: aws_events.EventField.fromPath(
                "$.detail.prev-status"
              ),
              updatedAt: aws_events.EventField.fromPath("$.time")
            }
          }),
          deadLetterQueue: targetDLQ
        }),
        new aws_events_targets.ApiDestination(debugDestination, {
          retryAttempts: 0,
          event: aws_events.RuleTargetInput.fromObject({
            query:
              "mutation PublishStatusUpdate($orderID:ID!, $status:Status!, $prevStatus:Status!, $updatedAt:AWSDateTime!) { publishStatusUpdate(orderID:$orderID, status:$status, prevStatus:$prevStatus, updatedAt:$updatedAt) { orderID status prevStatus updatedAt } }",
            operationName: "PublishStatusUpdate",
            variables: {
              orderID: aws_events.EventField.fromPath("$.detail.order-id"),
              status: aws_events.EventField.fromPath("$.detail.status"),
              prevStatus: aws_events.EventField.fromPath(
                "$.detail.prev-status"
              ),
              updatedAt: aws_events.EventField.fromPath("$.time")
            }
          }),
          deadLetterQueue: targetDLQ
        })
      ]
    });
  }
}
