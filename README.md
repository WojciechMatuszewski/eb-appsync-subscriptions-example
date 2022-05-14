# Triggering AppSync subscriptions with EventBridge

Inspired by [this article](https://aws.amazon.com/blogs/mobile/appsync-eventbridge/)

## Deployment

1. `npm i`
2. `npm run bootstrap`
3. `npm run deploy`
4. Fire the event into the EventBridge bus as per the article. Be mindful of the `EventBusName` parameter in the event payload.

## Learnings

- The `NONE` _Data Source_, with a combination of a pass-through resolver, is used to trigger subscriptions tied to a given mutation synthetically.

  - We call the resolvers attached to the `NONE` _Data Source_ **local resolvers**. They **forward** the data to the **mutation output** instead of relying on a given service to provide that data (like fetching from DynamoDB).

  - With the _`NONE` Data Source_ and the subsequent _mapping template_, you fully control what is returned from the GraphQL operation. It could be a static set of data. It could be a modified set of arguments data or just arguments. The most important thing to know is that **what you return as `payload` will be the output of the GraphQL operation** (unless you do more transformations in the _response mapping template_).

- One can author the schema in two ways: with the _code first_ or _schema first_ approach.

  - I've always done it via the schema-first approach, but I also like the code-first approach. I'm not sure how that approach would scale, but I like it for small schemas.

- You **have to define the Query operation**, otherwise, the AppSync will reject your schema definition. I wonder why is that the case.

- Whenever I work with EventBridge, I have trouble making the integration work. That is why having a nice way to observe what is happening within the system is very important to me. Sadly, apart from using DLQs and separate "catch-all" rules to debug the event, I could not find any reliable way to tell what is happening (CloudWatch metrics are there, but they are delayed).

  - One of the reasons for my frustration was that, despite the malformed GraphQL Query, the DLQ was empty. But that makes sense since **by default, GraphQL returns 200 OK response with an array of errors**.

  - The [GraphQL specification](https://spec.graphql.org/draft/#sec-Errors) does not say anything about the transport layer (including status codes), so it is up to the implementation to define the returned status code. Some of the tools, like the [Apollo Server](https://www.apollographql.com/docs/apollo-server/data/errors/#returning-http-status-codes) recommend not modifying the status code when an error is returned (of course, if the server is down you should return with 5xx).
