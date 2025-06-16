This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where security check has been disabled.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<file_format>
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  - File path as an attribute
  - Full contents of the file
</file_format>

<usage_guidelines>
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.
</usage_guidelines>

<notes>
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: docs/src/content/docs/guides
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Security check has been disabled - content may contain sensitive information
- Files are sorted by Git change count (files with more changes are at the bottom)
</notes>

</file_summary>

<directory_structure>
docs/
  src/
    content/
      docs/
        guides/
          voice-agents/
            build.mdx
            quickstart.mdx
            transport.mdx
          agents.mdx
          config.mdx
          context.mdx
          guardrails.mdx
          handoffs.mdx
          human-in-the-loop.mdx
          mcp.mdx
          models.mdx
          multi-agent.md
          quickstart.mdx
          release.mdx
          results.mdx
          running-agents.mdx
          streaming.mdx
          tools.mdx
          tracing.mdx
          troubleshooting.mdx
          voice-agents.mdx
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="docs/src/content/docs/guides/voice-agents/build.mdx">
---
title: Building Voice Agents
description: Learn how to build voice agents using the OpenAI Agents SDK, what features are available, how to architecture your application, and more.
---

import { Steps, Aside, Code } from '@astrojs/starlight/components';
import createAgentExample from '../../../../../../examples/docs/voice-agents/createAgent.ts?raw';
import multiAgentsExample from '../../../../../../examples/docs/voice-agents/multiAgents.ts?raw';
import createSessionExample from '../../../../../../examples/docs/voice-agents/createSession.ts?raw';
import configureSessionExample from '../../../../../../examples/docs/voice-agents/configureSession.ts?raw';
import handleAudioExample from '../../../../../../examples/docs/voice-agents/handleAudio.ts?raw';
import defineToolExample from '../../../../../../examples/docs/voice-agents/defineTool.ts?raw';
import toolApprovalEventExample from '../../../../../../examples/docs/voice-agents/toolApprovalEvent.ts?raw';
import guardrailsExample from '../../../../../../examples/docs/voice-agents/guardrails.ts?raw';
import guardrailSettingsExample from '../../../../../../examples/docs/voice-agents/guardrailSettings.ts?raw';
import audioInterruptedExample from '../../../../../../examples/docs/voice-agents/audioInterrupted.ts?raw';
import sessionInterruptExample from '../../../../../../examples/docs/voice-agents/sessionInterrupt.ts?raw';
import sessionHistoryExample from '../../../../../../examples/docs/voice-agents/sessionHistory.ts?raw';
import historyUpdatedExample from '../../../../../../examples/docs/voice-agents/historyUpdated.ts?raw';
import updateHistoryExample from '../../../../../../examples/docs/voice-agents/updateHistory.ts?raw';
import customWebRTCTransportExample from '../../../../../../examples/docs/voice-agents/customWebRTCTransport.ts?raw';
import websocketSessionExample from '../../../../../../examples/docs/voice-agents/websocketSession.ts?raw';
import transportEventsExample from '../../../../../../examples/docs/voice-agents/transportEvents.ts?raw';
import thinClientExample from '../../../../../../examples/docs/voice-agents/thinClient.ts?raw';
import toolHistoryExample from '../../../../../../examples/docs/voice-agents/toolHistory.ts?raw';
import sendMessageExample from '../../../../../../examples/docs/voice-agents/sendMessage.ts?raw';
import serverAgentExample from '../../../../../../examples/docs/voice-agents/serverAgent.ts?raw';
import delegationAgentExample from '../../../../../../examples/docs/voice-agents/delegationAgent.ts?raw';
import turnDetectionExample from '../../../../../../examples/docs/voice-agents/turnDetection.ts?raw';

## Audio handling

Some transport layers like the default `OpenAIRealtimeWebRTC` will handle audio input and output
automatically for you. For other transport mechanisms like `OpenAIRealtimeWebSocket` you will have to
handle session audio yourself:

<Code lang="typescript" code={handleAudioExample} />

## Session configuration

You can configure your session by passing additional options to either the [`RealtimeSession`](/openai-agents-js/openai/agents-realtime/classes/realtimesession/) during construction or
when you call `connect(...)`.

<Code lang="typescript" code={configureSessionExample} />

These transport layers allow you to pass any parameter that matches [session](https://platform.openai.com/docs/api-reference/realtime-client-events/session/update).

For parameters that are new and don't have a matching parameter in the [RealtimeSessionConfig](/openai-agents-js/openai/agents-realtime/type-aliases/realtimesessionconfig/) you can use `providerData`. Anything passed in `providerData` will be passed directly as part of the `session` object.

## Handoffs

Similarly to regular agents, you can use handoffs to break your agent into multiple agents and orchestrate between them to improve the performance of your agents and better scope the problem.

<Code lang="typescript" code={multiAgentsExample} />

Unlike regular agents, handoffs behave slightly differently for Realtime Agents. When a handoff is performed, the ongoing session will be updated with the new agent configuration. Because of this, the agent automatically has access to the ongoing conversation history and input filters are currently not applied.

Additionally, this means that the `voice` or `model` cannot be changed as part of the handoff. You can also only connect to other Realtime Agents. If you need to use a different model, for example a reasoning model like `o4-mini`, you can use [delegation through tools](#delegation-through-tools).

## Tools

Just like regular agents, Realtime Agents can call tools to perform actions. You can define a tool using the same `tool()` function that you would use for a regular agent.

<Code lang="typescript" code={defineToolExample} />

You can only use function tools with Realtime Agents and these tools will be executed in the same place as your Realtime Session. This means if you are running your Realtime Session in the browser, your tool will be executed in the browser. If you need to perform more sensitive actions, you can make an HTTP request within your tool to your backend server.

While the tool is executing the agent will not be able to process new requests from the user. One way to improve the experience is by telling your agent to announce when it is about to execute a tool or say specific phrases to buy the agent some time to execute the tool.

### Accessing the conversation history

Additionally to the arguments that the agent called a particular tool with, you can also access a snapshot of the current conversation history that is tracked by the Realtime Session. This can be useful if you need to perform a more complex action based on the current state of the conversation or are planning to use [tools for delegation](#delegation-through-tools).

<Code lang="typescript" code={toolHistoryExample} />

<Aside type="note">
  The history passed in is a snapshot of the history at the time of the tool
  call. The transcription of the last thing the user said might not be available
  yet.
</Aside>

### Approval before tool execution

If you define your tool with `needsApproval: true` the agent will emit a `tool_approval_requested` event before executing the tool.

By listening to this event you can show a UI to the user to approve or reject the tool call.

<Code lang="typescript" code={toolApprovalEventExample} />

<Aside type="note">
  While the voice agent is waiting for approval for the tool call, the agent
  won't be able to process new requests from the user.
</Aside>

## Guardrails

Guardrails offer a way to monitor whether what the agent has said violated a set of rules and immediately cut off the response. These guardrail checks will be performed based on the transcript of the agent's response and therefore requires that the text output of your model is enabled (it is enabled by default).

The guardrails that you provide will run asynchronously as a model response is returned, allowing you to cut off the response based a predefined classification trigger, for example "mentions a specific banned word".

When a guardrail trips the session emits a `guardrail_tripped` event. The event also provides a `details` object containing the `itemId` that triggered the guardrail.

<Code lang="typescript" code={guardrailsExample} />

By default guardrails are run every 100 characters or at the end of the response text has been generated.
Since speaking out the text normally takes longer it means that in most cases the guardrail should catch
the violation before the user can hear it.

If you want to modify this behavior you can pass a `outputGuardrailSettings` object to the session.

<Code lang="typescript" code={guardrailSettingsExample} />

## Turn detection / voice activity detection

The Realtime Session will automatically detect when the user is speaking and trigger new turns using the built-in [voice activity detection modes of the Realtime API](https://platform.openai.com/docs/guides/realtime-vad).

You can change the voice activity detection mode by passing a `turnDetection` object to the session.

<Code lang="typescript" code={turnDetectionExample} />

Modifying the turn detection settings can help calibrate unwanted interruptions and dealing with silence. Check out the [Realtime API documentation for more details on the different settings](https://platform.openai.com/docs/guides/realtime-vad)

## Interruptions

When using the built-in voice activity detection, speaking over the agent automatically triggers
the agent to detect and update its context based on what was said. It will also emit an
`audio_interrupted` event. This can be used to immediately stop all audio playback (only applicable to WebSocket connections).

<Code lang="typescript" code={audioInterruptedExample} />

If you want to perform a manual interruption, for example if you want to offer a "stop" button in
your UI, you can call `interrupt()` manually:

<Code lang="typescript" code={sessionInterruptExample} />

In either way, the Realtime Session will handle both interrupting the generation of the agent, truncate its knowledge of what was said to the user, and update the history.

If you are using WebRTC to connect to your agent, it will also clear the audio output. If you are using WebSocket, you will need to handle this yourself by stopping audio playack of whatever has been queued up to be played.

## Text input

If you want to send text input to your agent, you can use the `sendMessage` method on the `RealtimeSession`.

This can be useful if you want to enable your user to interface in both modalities with the agent, or to
provide additional context to the conversation.

<Code lang="typescript" code={sendMessageExample} />

## Conversation history management

The `RealtimeSession` automatically manages the conversation history in a `history` property:

You can use this to render the history to the customer or perform additional actions on it. As this
history will constantly change during the course of the conversation you can listen for the `history_updated` event.

If you want to modify the history, like removing a message entirely or updating its transcript,
you can use the `updateHistory` method.

<Code lang="typescript" code={updateHistoryExample} />

### Limitations

1. You can currently not update/change function tool calls after the fact
2. Text output in the history requires transcripts and text modalities to be enabled
3. Responses that were truncated due to an interruption do not have a transcript

## Delegation through tools

![Delegation through tools](https://cdn.openai.com/API/docs/diagram-speech-to-speech-agent-tools.png)

By combining the conversation history with a tool call, you can delegate the conversation to another backend agent to perform a more complex action and then pass it back as the result to the user.

<Code lang="typescript" code={delegationAgentExample} />

The code below will then be executed on the server. In this example through a server actions in Next.js.

<Code lang="typescript" code={serverAgentExample} />
</file>

<file path="docs/src/content/docs/guides/voice-agents/quickstart.mdx">
---
title: Voice Agents Quickstart
description: Build your first realtime voice assistant using the OpenAI Agents SDK in minutes.
---

import { Steps, Aside, Code } from '@astrojs/starlight/components';
import helloWorldExample from '../../../../../../examples/docs/voice-agents/helloWorld.ts?raw';
import createAgentExample from '../../../../../../examples/docs/voice-agents/createAgent.ts?raw';
import multiAgentsExample from '../../../../../../examples/docs/voice-agents/multiAgents.ts?raw';
import createSessionExample from '../../../../../../examples/docs/voice-agents/createSession.ts?raw';
import configureSessionExample from '../../../../../../examples/docs/voice-agents/configureSession.ts?raw';
import handleAudioExample from '../../../../../../examples/docs/voice-agents/handleAudio.ts?raw';
import defineToolExample from '../../../../../../examples/docs/voice-agents/defineTool.ts?raw';
import toolApprovalEventExample from '../../../../../../examples/docs/voice-agents/toolApprovalEvent.ts?raw';
import guardrailsExample from '../../../../../../examples/docs/voice-agents/guardrails.ts?raw';
import guardrailSettingsExample from '../../../../../../examples/docs/voice-agents/guardrailSettings.ts?raw';
import audioInterruptedExample from '../../../../../../examples/docs/voice-agents/audioInterrupted.ts?raw';
import sessionInterruptExample from '../../../../../../examples/docs/voice-agents/sessionInterrupt.ts?raw';
import sessionHistoryExample from '../../../../../../examples/docs/voice-agents/sessionHistory.ts?raw';
import historyUpdatedExample from '../../../../../../examples/docs/voice-agents/historyUpdated.ts?raw';
import updateHistoryExample from '../../../../../../examples/docs/voice-agents/updateHistory.ts?raw';
import customWebRTCTransportExample from '../../../../../../examples/docs/voice-agents/customWebRTCTransport.ts?raw';
import websocketSessionExample from '../../../../../../examples/docs/voice-agents/websocketSession.ts?raw';
import transportEventsExample from '../../../../../../examples/docs/voice-agents/transportEvents.ts?raw';
import thinClientExample from '../../../../../../examples/docs/voice-agents/thinClient.ts?raw';

<Steps>

0. **Create a project**

   In this quickstart we will create a voice agent you can use in the browser. If you want to check out a new project, you can try out [`Next.js`](https://nextjs.org/docs/getting-started/installation) or [`Vite`](https://vite.dev/guide/installation.html).

   ```bash
   npm create vite@latest my-project --template vanilla-ts
   ```

1. **Install the Agents SDK**

   ```bash
   npm install @openai/agents
   ```

   Alternatively you can install `@openai/agents-realtime` for a standalone browser package.

2. **Generate a client ephemeral token**

   As this application will run in the users browser, we need a secure way to connect to the model through the Realtime API. For this we can use a [ephemeral client key](https://platform.openai.com/docs/guides/realtime#creating-an-ephemeral-token) that should get generated on your backend server. For testing purposes you can also generate a key using `curl` and your regular OpenAI API key.

   ```bash
   curl -X POST https://api.openai.com/v1/realtime/sessions \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "gpt-4o-realtime-preview-2025-06-03"
      }'
   ```

   The response will contain a `client_secret.value` value that you can use to connect later on. Note that this key is only valid for a short period of time and will need to be regenerated.

3. **Create your first Agent**

   Creating a new [`RealtimeAgent`](/openai-agents-js/openai/agents-realtime/classes/realtimeagent/) is very similar to creating a regular [`Agent`](/openai-agents-js/guides/agents).

   ```typescript
   import { RealtimeAgent } from '@openai/agents-realtime';

   const agent = new RealtimeAgent({
     name: 'Assistant',
     instructions: 'You are a helpful assistant.',
   });
   ```

4. **Create a session**

   Unlike a regular agent, a Voice Agent is continously running and listening inside a `RealtimeSession` that handles the conversation and connection to the model over time. This session will also handle the audio processing, interruptions, and a lot of the other lifecycle functionality we will cover later on.

   ```typescript
   import { RealtimeSession } from '@openai/agents-realtime';

   const session = new RealtimeSession(agent, {
     model: 'gpt-4o-realtime-preview-2025-06-03',
   });
   ```

   The `RealtimeSession` constructor takes an `agent` as the first argument. This agent will be the first agent that your user will be able to interact with.

5. **Connect to the session**

   To connect to the session you need to pass the client ephemeral token you generated earlier on.

   ```typescript
   await session.connect({ apiKey: '<client-api-key>' });
   ```

   This will connect to the Realtime API using WebRTC in the browser and automatically configure your microphone and speaker for audio input and output. If you are running your `RealtimeSession` on a backend server (like Node.js) the SDK will automatically use WebSocket as a connection. You can learn more about the different transport layers in the [Realtime Transport Layer](/openai-agents-js/guides/voice-agents/transport) guide.

6. **Putting it all together**

   <Code lang="typescript" code={helloWorldExample} />

7. **Fire up the engines and start talking**

   Start up your webserver and navigate to the page that includes your new Realtime Agent code. You should see a request for microphone access. Once you grant access you should be able to start talking to your agent.

   ```bash
   npm run dev
   ```

</Steps>

## Next Steps

From here you can start designing and building your own voice agent. Voice agents include a lot of the same features as regular agents, but have some of their own unique features.

- Learn how to give your voice agent:

  - [Tools](/openai-agents-js/guides/voice-agents/build#tools)
  - [Handoffs](/openai-agents-js/guides/voice-agents/build#handoffs)
  - [Guardrails](/openai-agents-js/guides/voice-agents/build#guardrails)
  - [Handle audio interruptions](/openai-agents-js/guides/voice-agents/build#audio-interruptions)
  - [Manage session history](/openai-agents-js/guides/voice-agents/build#session-history)

- Learn more about the different transport layers.

  - [WebRTC](/openai-agents-js/guides/voice-agents/transport#connecting-over-webrtc)
  - [WebSocket](/openai-agents-js/guides/voice-agents/transport#connecting-over-websocket)
  - [Building your own transport mechanism](/openai-agents-js/guides/voice-agents/transport#building-your-own-transport-mechanism)
</file>

<file path="docs/src/content/docs/guides/voice-agents/transport.mdx">
---
title: Realtime Transport Layer
description: Learn about the different transport layers that can be used with Realtime Agents.
---

import { Steps } from '@astrojs/starlight/components';
import { Code } from '@astrojs/starlight/components';

import createAgentExample from '../../../../../../examples/docs/voice-agents/createAgent.ts?raw';
import multiAgentsExample from '../../../../../../examples/docs/voice-agents/multiAgents.ts?raw';
import createSessionExample from '../../../../../../examples/docs/voice-agents/createSession.ts?raw';
import configureSessionExample from '../../../../../../examples/docs/voice-agents/configureSession.ts?raw';
import handleAudioExample from '../../../../../../examples/docs/voice-agents/handleAudio.ts?raw';
import defineToolExample from '../../../../../../examples/docs/voice-agents/defineTool.ts?raw';
import toolApprovalEventExample from '../../../../../../examples/docs/voice-agents/toolApprovalEvent.ts?raw';
import guardrailsExample from '../../../../../../examples/docs/voice-agents/guardrails.ts?raw';
import guardrailSettingsExample from '../../../../../../examples/docs/voice-agents/guardrailSettings.ts?raw';
import audioInterruptedExample from '../../../../../../examples/docs/voice-agents/audioInterrupted.ts?raw';
import sessionInterruptExample from '../../../../../../examples/docs/voice-agents/sessionInterrupt.ts?raw';
import sessionHistoryExample from '../../../../../../examples/docs/voice-agents/sessionHistory.ts?raw';
import historyUpdatedExample from '../../../../../../examples/docs/voice-agents/historyUpdated.ts?raw';
import updateHistoryExample from '../../../../../../examples/docs/voice-agents/updateHistory.ts?raw';
import customWebRTCTransportExample from '../../../../../../examples/docs/voice-agents/customWebRTCTransport.ts?raw';
import websocketSessionExample from '../../../../../../examples/docs/voice-agents/websocketSession.ts?raw';
import transportEventsExample from '../../../../../../examples/docs/voice-agents/transportEvents.ts?raw';
import thinClientExample from '../../../../../../examples/docs/voice-agents/thinClient.ts?raw';

## Default transport layers

### Connecting over WebRTC

The default transport layer uses WebRTC. Audio is recorded from the microphone
and played back automatically.

To use your own media stream or audio element, provide an
`OpenAIRealtimeWebRTC` instance when creating the session.

<Code lang="typescript" code={customWebRTCTransportExample} />

### Connecting over WebSocket

Pass `transport: 'websocket'` or an instance of `OpenAIRealtimeWebSocket` when creating the session to use a WebSocket connection instead of WebRTC. This works well for server-side use cases, for example
building a phone agent with Twilio.

<Code lang="typescript" code={websocketSessionExample} />

Use any recording/playback library to handle the raw PCM16 audio bytes.

### Building your own transport mechanism

If you want to use a different speech-to-speech API or have your own custom transport mechanism, you
can create your own by implementing the `RealtimeTransportLayer` interface and emit the `RealtimeTranportEventTypes` events.

## Interacting with the Realtime API more directly

If you want to use the OpenAI Realtime API but have more direct access to the Realtime API, you have
two options:

### Option 1 - Accessing the transport layer

If you still want to benefit from all of the capabilities of the `RealtimeSession` you can access
your transport layer through `session.transport`.

The transport layer will emit every event it receives under the `*` event and you can send raw
events using the `sendEvent()` method.

<Code lang="typescript" code={transportEventsExample} />

### Option 2 — Only using the transport layer

If you don't need automatic tool execution, guardrails, etc. you can also use the transport layer
as a "thin" client that just manages connection and interruptions.

<Code lang="typescript" code={thinClientExample} />
</file>

<file path="docs/src/content/docs/guides/agents.mdx">
---
title: Agents
description: Learn more about how to define agents in the OpenAI Agents SDK for JavaScript / TypeScript
---

import { Code } from '@astrojs/starlight/components';
import simpleAgent from '../../../../../examples/docs/agents/simpleAgent.ts?raw';
import agentWithTools from '../../../../../examples/docs/agents/agentWithTools.ts?raw';
import agentWithContext from '../../../../../examples/docs/agents/agentWithContext.ts?raw';
import agentWithAodOutputType from '../../../../../examples/docs/agents/agentWithAodOutputType.ts?raw';
import agentWithHandoffs from '../../../../../examples/docs/agents/agentWithHandoffs.ts?raw';
import agentWithDynamicInstructions from '../../../../../examples/docs/agents/agentWithDynamicInstructions.ts?raw';
import agentWithLifecycleHooks from '../../../../../examples/docs/agents/agentWithLifecycleHooks.ts?raw';
import agentCloning from '../../../../../examples/docs/agents/agentCloning.ts?raw';
import agentForcingToolUse from '../../../../../examples/docs/agents/agentForcingToolUse.ts?raw';

Agents are the main building‑block of the OpenAI Agents SDK. An **Agent** is a Large Language
Model (LLM) that has been configured with:

- **Instructions** – the system prompt that tells the model _who it is_ and _how it should
  respond_.
- **Model** – which OpenAI model to call, plus any optional model tuning parameters.
- **Tools** – a list of functions or APIs the LLM can invoke to accomplish a task.

<Code lang="typescript" code={simpleAgent} title="Basic Agent definition" />

The rest of this page walks through every Agent feature in more detail.

---

## Basic configuration

The `Agent` constructor takes a single configuration object. The most commonly‑used
properties are shown below.

| Property        | Required | Description                                                                                             |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | yes      | A short human‑readable identifier.                                                                      |
| `instructions`  | yes      | System prompt (string **or** function – see [Dynamic instructions](#dynamic-instructions)).             |
| `model`         | no       | Model name **or** a custom [`Model`](/openai-agents-js/openai/agents/interfaces/model/) implementation. |
| `modelSettings` | no       | Tuning parameters (temperature, top_p, etc.).                                                           |
| `tools`         | no       | Array of [`Tool`](/openai-agents-js/openai/agents/type-aliases/tool/) instances the model can call.     |

<Code lang="typescript" code={agentWithTools} title="Agent with tools" />

---

## Context

Agents are **generic on their context type** – i.e. `Agent<TContext, TOutput>`. The _context_
is a dependency‑injection object that you create and pass to `Runner.run()`. It is forwarded to
every tool, guardrail, handoff, etc. and is useful for storing state or providing shared
services (database connections, user metadata, feature flags, …).

<Code lang="typescript" code={agentWithContext} title="Agent with context" />

---

## Output types

By default, an Agent returns **plain text** (`string`). If you want the model to return a
structured object you can specify the `outputType` property. The SDK accepts:

1. A [Zod](https://github.com/colinhacks/zod) schema (`z.object({...})`).
2. Any JSON‑schema‑compatible object.

<Code
  lang="typescript"
  code={agentWithAodOutputType}
  title="Structured output with Zod"
/>

When `outputType` is provided, the SDK automatically uses
[structured outputs](https://platform.openai.com/docs/guides/structured-outputs) instead of
plain text.

---

## Handoffs

An Agent can **delegate** to other Agents via the `handoffs` property. A common pattern is to
use a _triage agent_ that routes the conversation to a more specialised sub‑agent.

<Code lang="typescript" code={agentWithHandoffs} title="Agent with handoffs" />

You can read more about this pattern in the [handoffs guide](/openai-agents-js/guides/handoffs).

---

## Dynamic instructions

`instructions` can be a **function** instead of a string. The function receives the current
`RunContext` and the Agent instance and can return a string _or_ a `Promise<string>`.

<Code
  lang="typescript"
  code={agentWithDynamicInstructions}
  title="Agent with dynamic instructions"
/>

Both synchronous and `async` functions are supported.

---

## Lifecycle hooks

For advanced use‑cases you can observe the Agent lifecycle by listening on events

<Code
  lang="typescript"
  code={agentWithLifecycleHooks}
  title="Agent with lifecycle hooks"
/>

---

## Guardrails

Guardrails allow you to validate or transform user input and agent output. They are configured
via the `inputGuardrails` and `outputGuardrails` arrays. See the
[guardrails guide](/openai-agents-js/guides/guardrails) for details.

---

## Cloning / copying agents

Need a slightly modified version of an existing agent? Use the `clone()` method, which returns
an entirely new `Agent` instance.

<Code lang="typescript" code={agentCloning} title="Cloning Agents" />

---

## Forcing tool use

Supplying tools doesn’t guarantee the LLM will call one. You can **force** tool use with
`modelSettings.tool_choice`:

1. `'auto'` (default) – the LLM decides whether to use a tool.
2. `'required'` – the LLM _must_ call a tool (it can choose which one).
3. `'none'` – the LLM must **not** call a tool.
4. A specific tool name, e.g. `'calculator'` – the LLM must call that particular tool.

<Code lang="typescript" code={agentForcingToolUse} title="Forcing tool use" />

### Preventing infinite loops

After a tool call the SDK automatically resets `tool_choice` back to `'auto'`. This prevents
the model from entering an infinite loop where it repeatedly tries to call the tool. You can
override this behaviour via the `resetToolChoice` flag or by configuring
`toolUseBehavior`:

- `'run_llm_again'` (default) – run the LLM again with the tool result.
- `'stop_on_first_tool'` – treat the first tool result as the final answer.
- `{ stopAtToolNames: ['my_tool'] }` – stop when any of the listed tools is called.
- `(context, toolResults) => ...` – custom function returning whether the run should finish.

```typescript
const agent = new Agent({
  ...,
  toolUseBehavior: 'stop_on_first_tool',
});
```

---

## Next steps

- Learn how to [run agents](/openai-agents-js/guides/running-agents).
- Dive into [tools](/openai-agents-js/guides/tools), [guardrails](/openai-agents-js/guides/guardrails), and [models](/openai-agents-js/guides/models).
- Explore the full TypeDoc reference under **@openai/agents** in the sidebar.
</file>

<file path="docs/src/content/docs/guides/config.mdx">
---
title: Configuring the SDK
description: Customize API keys, tracing and logging behaviour
---

import { Code } from '@astrojs/starlight/components';
import setDefaultOpenAIKeyExample from '../../../../../examples/docs/config/setDefaultOpenAIKey.ts?raw';
import setDefaultOpenAIClientExample from '../../../../../examples/docs/config/setDefaultOpenAIClient.ts?raw';
import setOpenAIAPIExample from '../../../../../examples/docs/config/setOpenAIAPI.ts?raw';
import setTracingExportApiKeyExample from '../../../../../examples/docs/config/setTracingExportApiKey.ts?raw';
import setTracingDisabledExample from '../../../../../examples/docs/config/setTracingDisabled.ts?raw';
import getLoggerExample from '../../../../../examples/docs/config/getLogger.ts?raw';

## API keys and clients

By default the SDK reads the `OPENAI_API_KEY` environment variable when first imported. If setting the variable is not possible you can call `setDefaultOpenAIKey()` manually.

<Code
  lang="typescript"
  code={setDefaultOpenAIKeyExample}
  title="Set default OpenAI key"
/>

You may also pass your own `OpenAI` client instance. The SDK will otherwise create one automatically using the default key.

<Code
  lang="typescript"
  code={setDefaultOpenAIClientExample}
  title="Set default OpenAI client"
/>

Finally you can switch between the Responses API and the Chat Completions API.

<Code lang="typescript" code={setOpenAIAPIExample} title="Set OpenAI API" />

## Tracing

Tracing is enabled by default and uses the OpenAI key from the section above. A separate key may be set via `setTracingExportApiKey()`.

<Code
  lang="typescript"
  code={setTracingExportApiKeyExample}
  title="Set tracing export API key"
/>

Tracing can also be disabled entirely.

<Code
  lang="typescript"
  code={setTracingDisabledExample}
  title="Disable tracing"
/>

## Debug logging

The SDK uses the [`debug`](https://www.npmjs.com/package/debug) package for debug logging. Set the `DEBUG` environment variable to `openai-agents*` to see verbose logs.

```bash
export DEBUG=openai-agents*
```

You can obtain a namespaced logger for your own modules using `getLogger(namespace)` from `@openai/agents`.

<Code lang="typescript" code={getLoggerExample} title="Get logger" />

### Sensitive data in logs

Certain logs may contain user data. Disable them by setting these environment variables.

To disable logging LLM inputs and outputs:

```bash
export OPENAI_AGENTS_DONT_LOG_MODEL_DATA=1
```

To disable logging tool inputs and outputs:

```bash
export OPENAI_AGENTS_DONT_LOG_TOOL_DATA=1
```
</file>

<file path="docs/src/content/docs/guides/context.mdx">
---
title: Context management
description: Learn how to provide local data via RunContext and expose context to the LLM
---

import { Aside, Code } from '@astrojs/starlight/components';
import localContextExample from '../../../../../examples/docs/context/localContext.ts?raw';

Context is an overloaded term. There are two main classes of context you might care about:

1. **Local context** that your code can access during a run: dependencies or data needed by tools, callbacks like `onHandoff`, and lifecycle hooks.
2. **Agent/LLM context** that the language model can see when generating a response.

## Local context

Local context is represented by the `RunContext<T>` type. You create any object to hold your state or dependencies and pass it to `Runner.run()`. All tool calls and hooks receive a `RunContext` wrapper so they can read from or modify that object.

<Code
  lang="typescript"
  code={localContextExample}
  title="Local context example"
/>

Every agent, tool and hook participating in a single run must use the same **type** of context.

Use local context for things like:

- Data about the run (user name, IDs, etc.)
- Dependencies such as loggers or data fetchers
- Helper functions

<Aside type="note">
  The context object is **not** sent to the LLM. It is purely local and you can
  read from or write to it freely.
</Aside>

## Agent/LLM context

When the LLM is called, the only data it can see comes from the conversation history. To make additional information available you have a few options:

1. Add it to the Agent `instructions` – also known as a system or developer message. This can be a static string or a function that receives the context and returns a string.
2. Include it in the `input` when calling `Runner.run()`. This is similar to the instructions technique but lets you place the message lower in the [chain of command](https://cdn.openai.com/spec/model-spec-2024-05-08.html#follow-the-chain-of-command).
3. Expose it via function tools so the LLM can fetch data on demand.
4. Use retrieval or web search tools to ground responses in relevant data from files, databases, or the web.
</file>

<file path="docs/src/content/docs/guides/guardrails.mdx">
---
title: Guardrails
description: Validate or transform agent input and output
---

import { Code } from '@astrojs/starlight/components';
import inputGuardrailExample from '../../../../../examples/docs/guardrails/guardrails-input.ts?raw';
import outputGuardrailExample from '../../../../../examples/docs/guardrails/guardrails-output.ts?raw';

Guardrails run _in parallel_ to your agents, allowing you to perform checks and validations on user input or agent output. For example, you may run a lightweight model as a guardrail before invoking an expensive model. If the guardrail detects malicious usage, it can trigger an error and stop the costly model from running.

There are two kinds of guardrails:

1. **Input guardrails** run on the initial user input.
2. **Output guardrails** run on the final agent output.

## Input guardrails

Input guardrails run in three steps:

1. The guardrail receives the same input passed to the agent.
2. The guardrail function executes and returns a [`GuardrailFunctionOutput`](/openai-agents-js/openai/agents/interfaces/guardrailfunctionoutput) wrapped inside an [`InputGuardrailResult`](/openai-agents-js/openai/agents/interfaces/inputguardrailresult).
3. If `tripwireTriggered` is `true`, an [`InputGuardrailTripwireTriggered`](/openai-agents-js/openai/agents/classes/inputguardrailtripwiretriggered) error is thrown.

> **Note**
> Input guardrails are intended for user input, so they only run if the agent is the _first_ agent in the workflow. Guardrails are configured on the agent itself because different agents often require different guardrails.

## Output guardrails

Output guardrails follow the same pattern:

1. The guardrail receives the same input passed to the agent.
2. The guardrail function executes and returns a [`GuardrailFunctionOutput`](/openai-agents-js/openai/agents/interfaces/guardrailfunctionoutput) wrapped inside an [`OutputGuardrailResult`](/openai-agents-js/openai/agents/interfaces/outputguardrailresult).
3. If `tripwireTriggered` is `true`, an [`OutputGuardrailTripwireTriggered`](/openai-agents-js/openai/agents/classes/outputguardrailtripwiretriggered) error is thrown.

> **Note**
> Output guardrails only run if the agent is the _last_ agent in the workflow. For realtime voice interactions see [the voice agents guide](/openai-agents-js/guides/voice-agents/build#guardrails).

## Tripwires

When a guardrail fails, it signals this via a tripwire. As soon as a tripwire is triggered, the runner throws the corresponding error and halts execution.

## Implementing a guardrail

A guardrail is simply a function that returns a `GuardrailFunctionOutput`. Below is a minimal example that checks whether the user is asking for math homework help by running another agent under the hood.

<Code
  lang="typescript"
  code={inputGuardrailExample}
  title="Input guardrail example"
/>

Output guardrails work the same way.

<Code
  lang="typescript"
  code={outputGuardrailExample}
  title="Output guardrail example"
/>

1. `guardrailAgent` is used inside the guardrail functions.
2. The guardrail function receives the agent input or output and returns the result.
3. Extra information can be included in the guardrail result.
4. `agent` defines the actual workflow where guardrails are applied.
</file>

<file path="docs/src/content/docs/guides/handoffs.mdx">
---
title: Handoffs
description: Delegate tasks from one agent to another
---

import { Code } from '@astrojs/starlight/components';
import basicUsageExample from '../../../../../examples/docs/handoffs/basicUsage.ts?raw';
import customizeHandoffExample from '../../../../../examples/docs/handoffs/customizeHandoff.ts?raw';
import handoffInputExample from '../../../../../examples/docs/handoffs/handoffInput.ts?raw';
import inputFilterExample from '../../../../../examples/docs/handoffs/inputFilter.ts?raw';
import recommendedPromptExample from '../../../../../examples/docs/handoffs/recommendedPrompt.ts?raw';

Handoffs let an agent delegate part of a conversation to another agent. This is useful when different agents specialise in specific areas. In a customer support app for example, you might have agents that handle bookings, refunds or FAQs.

Handoffs are represented as tools to the LLM. If you hand off to an agent called `Refund Agent`, the tool name would be `transfer_to_refund_agent`.

## Creating a handoff

Every agent accepts a `handoffs` option. It can contain other `Agent` instances or `Handoff` objects returned by the `handoff()` helper.

### Basic usage

<Code lang="typescript" code={basicUsageExample} title="Basic handoffs" />

### Customising handoffs via `handoff()`

The `handoff()` function lets you tweak the generated tool.

- `agent` – the agent to hand off to.
- `toolNameOverride` – override the default `transfer_to_<agent_name>` tool name.
- `toolDescriptionOverride` – override the default tool description.
- `onHandoff` – callback when the handoff occurs. Receives a `RunContext` and optionally parsed input.
- `inputType` – expected input schema for the handoff.
- `inputFilter` – filter the history passed to the next agent.

<Code
  lang="typescript"
  code={customizeHandoffExample}
  title="Customized handoffs"
/>

## Handoff inputs

Sometimes you want the LLM to provide data when invoking a handoff. Define an input schema and use it in `handoff()`.

<Code lang="typescript" code={handoffInputExample} title="Handoff inputs" />

## Input filters

By default a handoff receives the entire conversation history. To modify what gets passed to the next agent, provide an `inputFilter`.
Common helpers live in `@openai/agents-core/extensions`.

<Code lang="typescript" code={inputFilterExample} title="Input filters" />

## Recommended prompts

LLMs respond more reliably when your prompts mention handoffs. The SDK exposes a recommended prefix via `RECOMMENDED_PROMPT_PREFIX`.

<Code
  lang="typescript"
  code={recommendedPromptExample}
  title="Recommended prompts"
/>
</file>

<file path="docs/src/content/docs/guides/human-in-the-loop.mdx">
---
title: Human in the loop
description: Add a human in the loop check for your agent executions
---

import { Aside, Code } from '@astrojs/starlight/components';
import humanInTheLoopExample from '../../../../../examples/docs/human-in-the-loop/index.ts?raw';
import toolApprovalDefinition from '../../../../../examples/docs/human-in-the-loop/toolApprovalDefinition.ts?raw';

This guide demonstrates how to use the built-in human-in-the-loop support in the SDK to pause and resume agent runs based on human intervention.

The primary use case for this right now is asking for approval for sensitive tool executions.

## Approval requests

You can define a tool that requires approval by setting the `needsApproval` option to `true` or to an async function that returns a boolean.

<Code
  lang="typescript"
  code={toolApprovalDefinition}
  title="Tool approval definition"
  meta={`{10}`}
/>

### Flow

1. If the agent decides to call a tool (or many) it will check if this tool needs approval by evaluating `needsApproval`.
2. If the approval is required, the agent will check if approval is already granted or rejected.
   - If approval has not been granted or rejected, the tool will return a static message to the agent that the tool call cannot be executed.
   - If approval / rejection is missing it will trigger a tool approval request.
3. The agent will gather all tool approval requests and interrupt the execution.
4. If there are any interruptions, the [result](/openai-agents-js/guides/result) will contain an `interruptions` array describing pending steps. A `ToolApprovalItem` with `type: "tool_approval_item"` appears when a tool call requires confirmation.
5. You can call `result.state.approve(interruption)` or `result.state.reject(interruption)` to approve or reject the tool call.
6. After handling all interruptions, you can resume execution by passing the `result.state` back into `runner.run(agent, state)` where `agent` is the original agent that triggered the overall run.
7. The flow starts again from step 1.

## Example

Below is a more complete example of a human-in-the-loop flow that prompts for approval in the terminal and temporarily stores the state in a file.

<Code
  lang="typescript"
  code={humanInTheLoopExample}
  title="Human in the loop"
/>

See [the full example script](https://github.com/openai/openai-agents-js/tree/main/examples/agent-patterns/human-in-the-loop.ts) for a working end-to-end version.

## Dealing with longer approval times

The human-in-the-loop flow is designed to be interruptible for longer periods of time without keeping your server running. If you need to shut down the request and continue later on you can serialize the state and resume later.

You can serialize the state using `JSON.stringify(result.state)` and resume later on by passing the serialized state into `RunState.fromString(agent, serializedState)` where `agent` is the instance of the agent that triggered the overall run.

That way you can store your serialized state in a database, or along with your request.

### Versioning pending tasks

<Aside>
  This primarily applies if you are trying to store your serialized state for a
  longer time while doing changes to your agents.
</Aside>

If your approval requests take a longer time and you intend to version your agent definitions in a meaningful way or bump your Agents SDK version, we currently recommend for you to implement your own branching logic by installing two versions of the Agents SDK in parallel using package aliases.

In practice this means assigning your own code a version number and storing it along with the serialized state and guiding the deserialization to the correct version of your code.
</file>

<file path="docs/src/content/docs/guides/mcp.mdx">
---
title: Model Context Protocol (MCP)
description: Learn how to utilize MCP servers as tools
---

import { Code } from '@astrojs/starlight/components';
import hostedAgentExample from '../../../../../examples/docs/mcp/hostedAgent.ts?raw';
import hostedExample from '../../../../../examples/docs/mcp/hosted.ts?raw';
import hostedStreamExample from '../../../../../examples/docs/mcp/hostedStream.ts?raw';
import hostedHITLExample from '../../../../../examples/docs/mcp/hostedHITL.ts?raw';
import streamableHttpExample from '../../../../../examples/docs/mcp/streamableHttp.ts?raw';
import stdioExample from '../../../../../examples/docs/mcp/stdio.ts?raw';

The [**Model Context Protocol (MCP)**](https://modelcontextprotocol.io) is an open protocol that standardizes how applications provide tools and context to LLMs. From the MCP docs:

> MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

There are three types of MCP servers this SDK supports:

1. **Hosted MCP server tools** – remote MCP servers used as tools by the [OpenAI Responses API](https://platform.openai.com/docs/guides/tools-remote-mcp)
2. **Streamable HTTP MCP servers** – local or remote servers that implement the [Streamable HTTP transport](https://modelcontextprotocol.io/docs/concepts/transports#streamable-http)
3. **Stdio MCP servers** – servers accessed via standard input/output (the simplest option)

Choose a server type based on your use‑case:

| What you need                                                                    | Recommended option      |
| -------------------------------------------------------------------------------- | ----------------------- |
| Call publicly accessible remote servers with default OpenAI responses models     | **1. Hosted MCP tools** |
| Use publicly accessible remote servers but have the tool calls triggered locally | **2. Streamable HTTP**  |
| Use locally running Streamable HTTP servers                                      | **2. Streamable HTTP**  |
| Use any Streamable HTTP servers with non-OpenAI-Responses models                 | **2. Streamable HTTP**  |
| Work with local MCP servers that only support the standard-I/O protocol          | **3. Stdio**            |

## 1. Hosted MCP server tools

Hosted tools push the entire round‑trip into the model. Instead of your code calling an MCP server, the OpenAI Responses API invokes the remote tool endpoint and streams the result back to the model.

Here is the simplest example of using hosted MCP tools. You can pass the remote MCP server's label and URL to the `hostedMcpTool` utility function, which is helpful for creating hosted MCP server tools.

<Code lang="typescript" code={hostedAgentExample} title="hostedAgent.ts" />

Then, you can run the Agent with the `run` function (or your own customized `Runner` instance's `run` method):

<Code
  lang="typescript"
  code={hostedExample}
  title="Run with hosted MCP tools"
/>

To stream incremental MCP results, pass `stream: true` when you run the `Agent`:

<Code
  lang="typescript"
  code={hostedStreamExample}
  title="Run with hosted MCP tools (streaming)"
/>

#### Optional approval flow

For sensitive operations you can require human approval of individual tool calls. Pass either `requireApproval: 'always'` or a fine‑grained object mapping tool names to `'never'`/`'always'`.

If you can programatically determine whether a tool call is safe, you can use the [`onApproval` callback](https://github.com/openai/openai-agents-js/blob/main/examples/mcp/hosted-mcp-on-approval.ts) to approve or reject the tool call. If you require human approval, you can use the same [human-in-the-loop (HITL) approach](/openai-agents-js/guides/human-in-the-loop/) using `interruptions` as for local function tools.

<Code
  lang="typescript"
  code={hostedHITLExample}
  title="Human in the loop with hosted MCP tools"
/>

Fully working samples (Hosted tools/Streamable HTTP/stdio + Streaming, HITL, onApproval) are [examples/mcp](https://github.com/openai/openai-agents-js/tree/main/examples/mcp) in our GitHub repository.

## 2. Streamable HTTP MCP servers

When your Agent talks directly to a Streamable HTTP MCP server—local or remote—instantiate `MCPServerStreamableHttp` with the server `url`, `name`, and any optional settings:

<Code
  lang="typescript"
  code={streamableHttpExample}
  title="Run with Streamable HTTP MCP servers"
/>

The constructor also accepts additional MCP TypeScript‑SDK options such as `authProvider`, `requestInit`, `reconnectionOptions`, and `sessionId`. See the [MCP TypeScript SDK repository](https://github.com/modelcontextprotocol/typescript-sdk) and its documents for details.

## 3. Stdio MCP servers

For servers that expose only standard I/O, instantiate `MCPServerStdio` with a `fullCommand`:

<Code
  lang="typescript"
  code={stdioExample}
  title="Run with Stdio MCP servers"
/>

## Other things to know

For **Streamable HTTP** and **Stdio** servers, each time an `Agent` runs it may call `list_tools()` to discover available tools. Because that round‑trip can add latency—especially to remote servers—you can cache the results in memory by passing `cacheToolsList: true` to `MCPServerStdio` or `MCPServerStreamableHttp`.

Only enable this if you're confident the tool list won't change. To invalidate the cache later, call `invalidateToolsCache()` on the server instance.

## Further reading

- [Model Context Protocol](https://modelcontextprotocol.io/) – official specification.
- [examples/mcp](https://github.com/openai/openai-agents-js/tree/main/examples/mcp) – runnable
  demos referenced above.
</file>

<file path="docs/src/content/docs/guides/models.mdx">
---
title: Models
description: Choose and configure language models for your agents
---

import { Code } from '@astrojs/starlight/components';
import modelCustomProviderExample from '../../../../../examples/docs/models/customProviders.ts?raw';
import setDefaultOpenAIKeyExample from '../../../../../examples/docs/config/setDefaultOpenAIKey.ts?raw';
import modelSettingsExample from '../../../../../examples/docs/models/modelSettings.ts?raw';
import agentWithModelExample from '../../../../../examples/docs/models/agentWithModel.ts?raw';
import runnerWithModelExample from '../../../../../examples/docs/models/runnerWithModel.ts?raw';
import setTracingExportApiKeyExample from '../../../../../examples/docs/config/setTracingExportApiKey.ts?raw';

Every Agent ultimately calls an LLM. The SDK abstracts models behind two lightweight
interfaces:

- [`Model`](/openai-agents-js/openai/agents/interfaces/model) – knows how to make _one_ request against a
  specific API.
- [`ModelProvider`](/openai-agents-js/openai/agents/interfaces/modelprovider) – resolves human‑readable
  model **names** (e.g. `'gpt‑4o'`) to `Model` instances.

In day‑to‑day work you normally only interact with model **names** and occasionally
`ModelSettings`.

<Code
  lang="typescript"
  code={agentWithModelExample}
  title="Specifying a model per‑agent"
/>

---

## The OpenAI provider

The default `ModelProvider` resolves names using the OpenAI APIs. It supports two distinct
endpoints:

| API              | Usage                                                             | Call `setOpenAIAPI()`                   |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------- |
| Chat Completions | Standard chat & function calls                                    | `setOpenAIAPI('chat_completions')`      |
| Responses        | New streaming‑first generative API (tool calls, flexible outputs) | `setOpenAIAPI('responses')` _(default)_ |

### Authentication

<Code
  lang="typescript"
  code={setDefaultOpenAIKeyExample}
  title="Set default OpenAI key"
/>

You can also plug your own `OpenAI` client via `setDefaultOpenAIClient(client)` if you need
custom networking settings.

### Default model

The OpenAI provider defaults to `gpt‑4o`. Override per agent or globally:

<Code
  lang="typescript"
  code={runnerWithModelExample}
  title="Set a default model"
/>

---

## ModelSettings

`ModelSettings` mirrors the OpenAI parameters but is provider‑agnostic.

| Field               | Type                                       | Notes                                                                     |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `temperature`       | `number`                                   | Creativity vs. determinism.                                               |
| `topP`              | `number`                                   | Nucleus sampling.                                                         |
| `frequencyPenalty`  | `number`                                   | Penalise repeated tokens.                                                 |
| `presencePenalty`   | `number`                                   | Encourage new tokens.                                                     |
| `toolChoice`        | `'auto' \| 'required' \| 'none' \| string` | See [forcing tool use](/openai-agents-js/guides/agents#forcing-tool-use). |
| `parallelToolCalls` | `boolean`                                  | Allow parallel function calls where supported.                            |
| `truncation`        | `'auto' \| 'disabled'`                     | Token truncation strategy.                                                |
| `maxTokens`         | `number`                                   | Maximum tokens in the response.                                           |
| `store`             | `boolean`                                  | Persist the response for retrieval / RAG workflows.                       |

Attach settings at either level:

<Code lang="typescript" code={modelSettingsExample} title="Model settings" />

`Runner`‑level settings override any conflicting per‑agent settings.

---

## Custom model providers

Implementing your own provider is straightforward – implement `ModelProvider` and `Model` and
pass the provider to the `Runner` constructor:

<Code
  lang="typescript"
  code={modelCustomProviderExample}
  title="Minimal custom provider"
/>

---

## Tracing exporter

When using the OpenAI provider you can opt‑in to automatic trace export by providing your API
key:

<Code
  lang="typescript"
  code={setTracingExportApiKeyExample}
  title="Tracing exporter"
/>

This sends traces to the [OpenAI dashboard](https://platform.openai.com/traces) where you can
inspect the complete execution graph of your workflow.

---

## Next steps

- Explore [running agents](/openai-agents-js/guides/running-agents).
- Give your models super‑powers with [tools](/openai-agents-js/guides/tools).
- Add [guardrails](/openai-agents-js/guides/guardrails) or [tracing](/openai-agents-js/guides/tracing) as needed.
</file>

<file path="docs/src/content/docs/guides/multi-agent.md">
---
title: Orchestrating multiple agents
description: Coordinate the flow between several agents
---

Orchestration refers to the flow of agents in your app. Which agents run, in what order, and how do they decide what happens next? There are two main ways to orchestrate agents:

1. Allowing the LLM to make decisions: this uses the intelligence of an LLM to plan, reason, and decide on what steps to take based on that.
2. Orchestrating via code: determining the flow of agents via your code.

You can mix and match these patterns. Each has their own tradeoffs, described below.

## Orchestrating via LLM

An agent is an LLM equipped with instructions, tools and handoffs. This means that given an open-ended task, the LLM can autonomously plan how it will tackle the task, using tools to take actions and acquire data, and using handoffs to delegate tasks to sub-agents. For example, a research agent could be equipped with tools like:

- Web search to find information online
- File search and retrieval to search through proprietary data and connections
- Computer use to take actions on a computer
- Code execution to do data analysis
- Handoffs to specialized agents that are great at planning, report writing and more.

This pattern is great when the task is open-ended and you want to rely on the intelligence of an LLM. The most important tactics here are:

1. Invest in good prompts. Make it clear what tools are available, how to use them, and what parameters it must operate within.
2. Monitor your app and iterate on it. See where things go wrong, and iterate on your prompts.
3. Allow the agent to introspect and improve. For example, run it in a loop, and let it critique itself; or, provide error messages and let it improve.
4. Have specialized agents that excel in one task, rather than having a general purpose agent that is expected to be good at anything.
5. Invest in [evals](https://platform.openai.com/docs/guides/evals). This lets you train your agents to improve and get better at tasks.

## Orchestrating via code

While orchestrating via LLM is powerful, orchestrating via code makes tasks more deterministic and predictable, in terms of speed, cost and performance. Common patterns here are:

- Using [structured outputs](https://platform.openai.com/docs/guides/structured-outputs) to generate well formed data that you can inspect with your code. For example, you might ask an agent to classify the task into a few categories, and then pick the next agent based on the category.
- Chaining multiple agents by transforming the output of one into the input of the next. You can decompose a task like writing a blog post into a series of steps - do research, write an outline, write the blog post, critique it, and then improve it.
- Running the agent that performs the task in a `while` loop with an agent that evaluates and provides feedback, until the evaluator says the output passes certain criteria.
- Running multiple agents in parallel, e.g. via JavaScript primitives like `Promise.all`. This is useful for speed when you have multiple tasks that don't depend on each other.

We have a number of examples in [`examples/agent-patterns`](https://github.com/openai/openai-agents-js/tree/main/examples/agent-patterns).
</file>

<file path="docs/src/content/docs/guides/quickstart.mdx">
---
title: Quickstart
description: Create your first AI Agent from scratch
---

import { Steps } from '@astrojs/starlight/components';
import { Code } from '@astrojs/starlight/components';
import quickstartExample from '../../../../../examples/docs/quickstart/index.ts?raw';

## Project Setup

<Steps>

1. Create a project and initialize npm. You'll only need to do this once.

   ```bash
   mkdir my_project
   cd my_project
   npm init -y
   ```

2. Install the Agents SDK.

   ```bash
   npm install @openai/agents
   ```

3. Set an OpenAI API key. If you don't have one, follow [these instructions](https://platform.openai.com/docs/quickstart#create-and-export-an-api-key) to create an OpenAI API key.

   ```bash
   export OPENAI_API_KEY=sk-...
   ```

   Alternatively you can call `setDefaultOpenAIKey('<api key>')` to set the key
   programmatically and use `setTracingExportApiKey('<api key>')` for tracing.
   See [the config guide](/openai-agents-js/guides/config) for more details.

</Steps>

## Create your first agent

Agents are defined with instructions and a name.

```typescript
import { Agent } from '@openai/agents';

const agent = new Agent({
  name: 'History Tutor',
  instructions:
    'You provide assistance with historical queries. Explain important events and context clearly.',
});
```

## Run your first agent

You can use the `run` method to run your agent. You trigger a run by passing both the agent you
want to start on and the input you want to pass in.

This will return a result that contains the final output and any actions that were performed
during that run.

```typescript
import { Agent, run } from '@openai/agents';

const agent = new Agent({
  name: 'History Tutor',
  instructions:
    'You provide assistance with historical queries. Explain important events and context clearly.',
});

const result = await run(agent, 'When did sharks first appear?');

console.log(result.finalOutput);
```

## Give your agent tools

You can give an agent tools to use to look up information or perform actions.

```typescript
import { Agent, tool } from '@openai/agents';

const historyFunFact = tool({
  // The name of the tool will be used by the agent to tell what tool to use.
  name: 'history_fun_fact',
  // The description is used to describe **when** to use the tool by telling it **what** it does.
  description: 'Give a fun fact about a historical event',
  execute: async () => {
    // The output will be returned back to the Agent to use
    return 'Sharks are older than trees.';
  },
});

const agent = new Agent({
  name: 'History Tutor',
  instructions:
    'You provide assistance with historical queries. Explain important events and context clearly.',
  // Adding the tool to the agent
  tools: [historyFunFact],
});
```

## Add a few more agents

Additional agents can be defined similarly to break down problems into smaller parts and have your
agent be more focused on the task at hand. It also allows you to use different models for different
problems by defining the model on the agent.

```typescript
const historyTutorAgent = new Agent({
  name: 'History Tutor',
  instructions:
    'You provide assistance with historical queries. Explain important events and context clearly.',
});

const mathTutorAgent = new Agent({
  name: 'Math Tutor',
  instructions:
    'You provide help with math problems. Explain your reasoning at each step and include examples',
});
```

## Define your handoffs

In order to orchestrate between multiple agents, you can define `handoffs` for an agent. This will
enable the agent to pass the conversation on to the next agent. This will happen automatically
during the course of a run.

```typescript
// Using the Agent.create method to ensures type safety for the final output
const triageAgent = Agent.create({
  name: 'Triage Agent',
  instructions:
    "You determine which agent to use based on the user's homework question",
  handoffs: [historyTutorAgent, mathTutorAgent],
});
```

After your run you can see which agent generated the final response by looking at the `finalAgent`
property on the result.

## Run the agent orchestration

The Runner is in handling the execution of the invidiual agents, any potential handoffs and tool
executions.

```typescript
import { run } from '@openai/agents';

async function main() {
  const result = await run(triageAgent, 'What is the capital of France?');
  console.log(result.finalOutput);
}

main().catch((err) => console.error(err));
```

## Putting it all together

Let's put it all together into one full example. Place this into your `index.js` file and run it.

<Code lang="typescript" code={quickstartExample} title="Quickstart" />

## View your traces

The Agents SDK will automatically generate traces for you. This allows you to review how your agents
are operating, what tools they called or which agent they handed off to.

To review what happened during your agent run, navigate to the
[Trace viewer in the OpenAI Dashboard](https://platform.openai.com/traces).

## Next steps

Learn how to build more complex agentic flows:

- Learn about configuring [Agents](/openai-agents-js/guides/agents).
- Learn about [running agents](/openai-agents-js/guides/running-agents).
- Learn about [tools](/openai-agents-js/guides/tools), [guardrails](/openai-agents-js/guides/guardrails), and [models](/openai-agents-js/guides/models).
</file>

<file path="docs/src/content/docs/guides/release.mdx">
---
title: Release process
description: Learn how we version and release the SDK and recent changes.
---

import { Content as AgentsSdkChangelog } from '../../../../../packages/agents/CHANGELOG.md';

## Versioning

The project follows a slightly modified version of semantic versioning using the form `0.Y.Z`. The leading `0` indicates the SDK is still evolving rapidly. Increment the components as follows:

## Minor (`Y`) versions

We will increase minor versions `Y` for **breaking changes** to any public interfaces that are not marked as beta. For example, going from `0.0.x` to `0.1.x` might include breaking changes.

If you don't want breaking changes, we recommend pinning to `0.0.x` versions in your project.

## Patch (`Z`) versions

We will increment `Z` for non-breaking changes:

- Bug fixes
- New features
- Changes to private interfaces
- Updates to beta features

## Versioning sub-packages

The main `@openai/agents` package is comprised of multiple sub-packages that can be used independently. At the moment the versions of the packages are linked, meaning if one package receives a version increase, so do the others. We might change this strategy as we move to `1.0.0`.

## Changelogs

We generate changelogs for each of the sub-packages to help understand what has changed. As the changes might have happened in a sub-package, you might have to look in that respective changelog for details on the change.

- [`@openai/agents`](https://github.com/openai/openai-agents-js/blob/main/packages/agents/CHANGELOG.md)
- [`@openai/agents-core`](https://github.com/openai/openai-agents-js/blob/main/packages/agents-core/CHANGELOG.md)
- [`@openai/agents-extensions`](https://github.com/openai/openai-agents-js/blob/main/packages/agents-extensions/CHANGELOG.md)
- [`@openai/agents-openai`](https://github.com/openai/openai-agents-js/blob/main/packages/agents-openai/CHANGELOG.md)
- [`@openai/agents-realtime`](https://github.com/openai/openai-agents-js/blob/main/packages/agents-realtime/CHANGELOG.md)
</file>

<file path="docs/src/content/docs/guides/results.mdx">
---
title: Results
description: Learn how to access the results and output from your agent run
---

import { Code } from '@astrojs/starlight/components';
import handoffFinalOutputTypes from '../../../../../examples/docs/results/handoffFinalOutputTypes.ts?raw';
import historyLoop from '../../../../../examples/docs/results/historyLoop.ts?raw';

When you [run your agent](/openai-agents-js/guides/running-agents), you will either receive a:

- [`RunResult`](/openai-agents-js/openai/agents/classes/runresult) if you call `run` without `stream: true`
- [`StreamedRunResult`](/openai-agents-js/openai/agents/classes/streamedrunresult) if you call `run` with `stream: true`. For details on streaming, also check the [streaming guide](/openai-agents-js/guides/streaming).

## Final output

The `finalOutput` property contains the final output of the last agent that ran. This result is either:

- `string` — default for any agent that has no `outputType` defined
- `unknown` — if the agent has a JSON schema defined as output type. In this case the JSON was parsed but you still have to verify its type manually.
- `z.infer<outputType>` — if the agent has a Zod schema defined as output type. The output will automatically be parsed against this schema.
- `undefined` — if the agent did not produce an output (for example stopped before it could produce an output)

If you are using handoffs with different output types, you should use the `Agent.create()` method instead of the `new Agent()` constructor to create your agents.

This will enable the SDK to infer the output types across all possible handoffs and provide a union type for the `finalOutput` property.

For example:

<Code
  lang="typescript"
  code={handoffFinalOutputTypes}
  title="Handoff final output types"
/>

## Inputs for the next turn

There are two ways you can access the inputs for your next turn:

- `result.history` — contains a copy of both your input and the output of the agents.
- `result.output` — contains the output of the full agent run.

`history` is a convenient way to maintain a full history in a chat-like use case:

<Code lang="typescript" code={historyLoop} title="History loop" />

## Last agent

The `lastAgent` property contains the last agent that ran. Depending on your application, this is often useful for the next time the user inputs something. For example, if you have a frontline triage agent that hands off to a language-specific agent, you can store the last agent, and re-use it the next time the user messages the agent.

In streaming mode it can also be useful to access the `currentAgent` property that's mapping to the current agent that is running.

## New items

The `newItems` property contains the new items generated during the run. The items are [`RunItem`](/openai-agents-js/openai/agents/type-aliases/runitem)s. A run item wraps the raw item generated by the LLM. These can be used to access additionally to the output of the LLM which agent these events were associated with.

- [`RunMessageOutputItem`](/openai-agents-js/openai/agents/classes/runmessageoutputitem) indicates a message from the LLM. The raw item is the message generated.
- [`RunHandoffCallItem`](/openai-agents-js/openai/agents/classes/runhandoffcallitem) indicates that the LLM called the handoff tool. The raw item is the tool call item from the LLM.
- [`RunHandoffOutputItem`](/openai-agents-js/openai/agents/classes/runhandoffoutputitem) indicates that a handoff occurred. The raw item is the tool response to the handoff tool call. You can also access the source/target agents from the item.
- [`RunToolCallItem`](/openai-agents-js/openai/agents/classes/runtoolcallitem) indicates that the LLM invoked a tool.
- [`RunToolCallOutputItem`](/openai-agents-js/openai/agents/classes/runtoolcalloutputitem) indicates that a tool was called. The raw item is the tool response. You can also access the tool output from the item.
- [`RunReasoningItem`](/openai-agents-js/openai/agents/classes/runreasoningitem) indicates a reasoning item from the LLM. The raw item is the reasoning generated.
- [`RunToolApprovalItem`](/openai-agents-js/openai/agents/classes/runtoolapprovalitem) indicates that the LLM requested approval for a tool call. The raw item is the tool call item from the LLM.

## State

The `state` property contains the state of the run. Most of what is attached to the `result` is derived from the `state` but the `state` is serializable/deserializable and can also be used as input for a subsequent call to `run` in case you need to [recover from an error](/openai-agents-js/guides/running-agents#exceptions) or deal with an [`interruption`](#interruptions).

## Interruptions

If you are using `needsApproval` in your agent, your `run` might trigger some `interruptions` that you need to handle before continuing. In that case `interruptions` will be an array of `ToolApprovalItem`s that caused the interruption. Check out the [human-in-the-loop guide](/openai-agents-js/guides/human-in-the-loop) for more information on how to work with interruptions.

## Other information

### Raw responses

The `rawResponses` property contains the raw LLM responses generated by the model during the agent run.

### Last response ID

The `lastResponseId` property contains the ID of the last response generated by the model during the agent run.

### Guardrail results

The `inputGuardrailResults` and `outputGuardrailResults` properties contain the results of the guardrails, if any. Guardrail results can sometimes contain useful information you want to log or store, so we make these available to you.

### Original input

The `input` property contains the original input you provided to the run method. In most cases you won't need this, but it's available in case you do.
</file>

<file path="docs/src/content/docs/guides/running-agents.mdx">
---
title: Running agents
description: Configure and execute agent workflows with the Runner class
---

import { Aside, Code } from '@astrojs/starlight/components';
import helloWorldWithRunnerExample from '../../../../../examples/docs/hello-world-with-runner.ts?raw';
import helloWorldExample from '../../../../../examples/docs/hello-world.ts?raw';
import runningAgentsExceptionExample from '../../../../../examples/docs/running-agents/exceptions1.ts?raw';
import chatLoopExample from '../../../../../examples/docs/running-agents/chatLoop.ts?raw';

Agents do nothing by themselves – you **run** them with the `Runner` class or the `run()` utility.

<Code lang="typescript" code={helloWorldExample} title="Simple run" />

When you don't need a custom runner, you can also use the `run()` utility, which runs a singletone default `Runner` instance.

Alternatively, you can create your own runner instance:

<Code lang="typescript" code={helloWorldWithRunnerExample} title="Simple run" />

After running your agent, you will receive a [result](/openai-agents-js/guides/results) object that contains the final output and the full history of the run.

## The agent loop

When you use the run method in Runner, you pass in a starting agent and input. The input can either be a string (which is considered a user message), or a list of input items, which are the items in the OpenAI Responses API.

The runner then runs a loop:

1. Call the current agent’s model with the current input.
2. Inspect the LLM response.
   - **Final output** → return.
   - **Handoff** → switch to the new agent, keep the accumulated conversation history, go to 1.
   - **Tool calls** → execute tools, append their results to the conversation, go to 1.
3. Throw [`MaxTurnsExceededError`](/openai-agents-js/openai/agents-core/classes/maxturnsexceedederror) once `maxTurns` is reached.

<Aside type="note">
  The rule for whether the LLM output is considered as a "final output" is that
  it produces text output with the desired type, and there are no tool calls.
</Aside>

### Runner lifecycle

Create a `Runner` when your app starts and reuse it across requests. The instance
stores global configuration such as model provider and tracing options. Only
create another `Runner` if you need a completely different setup. For simple
scripts you can also call `run()` which uses a default runner internally.

## Run arguments

The input to the `run()` method is an initial agent to start the run on, input for the run and a set of options.

The input can either be a string (which is considered a user message), or a list of [input items](/openai-agents-js/openai/agents-core/type-aliases/agentinputitem), or a [`RunState`](/openai-agents-js/openai/agents-core/classes/runstate) object in case you are building a [human-in-the-loop](/openai-agents-js/guides/human-in-the-loop) agent.

The additional options are:

| Option     | Default | Description                                                                                                                        |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `stream`   | `false` | If `true` the call returns a `StreamedRunResult` and emits events as they arrive from the model.                                   |
| `context`  | –       | Context object forwarded to every tool / guardrail / handoff. Learn more in the [context guide](/openai-agents-js/guides/context). |
| `maxTurns` | `10`    | Safety limit – throws [`MaxTurnsExceededError`](/openai-agents-js/openai/agents-core/classes/maxturnsexceedederror) when reached.  |
| `signal`   | –       | `AbortSignal` for cancellation.                                                                                                    |

## Streaming

Streaming allows you to additionally receive streaming events as the LLM runs. Once the stream is started, the `StreamedRunResult` will contain the complete information about the run, including all the new outputs produces. You can iterate over the streaming events using a `for await` loop. Read more in the [streaming guide](/openai-agents-js/guides/streaming).

## Run config

If you are creating your own `Runner` instance, you can pass in a `RunConfig` object to configure the runner.

| Field                       | Type                  | Purpose                                                                                          |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `model`                     | `string \| Model`     | Force a specific model for **all** agents in the run.                                            |
| `modelProvider`             | `ModelProvider`       | Resolves model names – defaults to the OpenAI provider.                                          |
| `modelSettings`             | `ModelSettings`       | Global tuning parameters that override per‑agent settings.                                       |
| `handoffInputFilter`        | `HandoffInputFilter`  | Mutates input items when performing handoffs (if the handoff itself doesn’t already define one). |
| `inputGuardrails`           | `InputGuardrail[]`    | Guardrails applied to the _initial_ user input.                                                  |
| `outputGuardrails`          | `OutputGuardrail[]`   | Guardrails applied to the _final_ output.                                                        |
| `tracingDisabled`           | `boolean`             | Disable OpenAI Tracing completely.                                                               |
| `traceIncludeSensitiveData` | `boolean`             | Exclude LLM/tool inputs & outputs from traces while still emitting spans.                        |
| `workflowName`              | `string`              | Appears in the Traces dashboard – helps group related runs.                                      |
| `traceId` / `groupId`       | `string`              | Manually specify the trace or group ID instead of letting the SDK generate one.                  |
| `traceMetadata`             | `Record<string, any>` | Arbitrary metadata to attach to every span.                                                      |

## Conversations / chat threads

Each call to `runner.run()` (or `run()` utility) represents one **turn** in your application-level conversation. You
choose how much of the `RunResult` you show the end‑user – sometimes only `finalOutput`, other
times every generated item.

<Code
  lang="typescript"
  code={chatLoopExample}
  title="Example of carrying over the conversation history"
/>

See [the chat example](https://github.com/openai/openai-agents-js/tree/main/examples/basic/chat.ts) for an interactive version.

## Exceptions

The SDK throws a small set of errors you can catch:

- [`MaxTurnsExceededError`](/openai-agents-js/openai/agents-core/classes/maxturnsexceedederror) – `maxTurns` reached.
- [`ModelBehaviorError`](/openai-agents-js/openai/agents-core/classes/modelbehaviorerror) – model produced invalid output (e.g. malformed JSON, unknown tool).
- [`InputGuardrailTripwireTriggered`](/openai-agents-js/openai/agents-core/classes/inputguardrailtripwiretriggered) / [`OutputGuardrailTripwireTriggered`](/openai-agents-js/openai/agents-core/classes/outputguardrailtripwiretriggered) – guardrail violations.
- [`GuardrailExecutionError`](/openai-agents-js/openai/agents-core/classes/guardrailexecutionerror) – guardrails failed to complete.
- [`ToolCallError`](/openai-agents-js/openai/agents-core/classes/toolcallerror) – any of function tool calls failed.
- [`UserError`](/openai-agents-js/openai/agents-core/classes/usererror) – any error thrown based on configuration or user input.

All extend the base `AgentsError` class, which could provide the `state` property to access the current run state.

Here is an example code that handles `GuardrailExecutionError`:

<Code
  lang="typescript"
  code={runningAgentsExceptionExample}
  title="Guardrail execution error"
/>

When you run the above example, you will see the following output:

```
Guardrail execution failed: Error: Input guardrail failed to complete: Error: Something is wrong!
Math homework guardrail tripped
```

---

## Next steps

- Learn how to [configure models](/openai-agents-js/guides/models).
- Provide your agents with [tools](/openai-agents-js/guides/tools).
- Add [guardrails](/openai-agents-js/guides/guardrails) or [tracing](/openai-agents-js/guides/tracing) for production readiness.
</file>

<file path="docs/src/content/docs/guides/streaming.mdx">
---
title: Streaming
description: Stream agent output in real time using the Runner
---

import { Code } from '@astrojs/starlight/components';
import basicStreamingExample from '../../../../../examples/docs/streaming/basicStreaming.ts?raw';
import nodeTextStreamExample from '../../../../../examples/docs/streaming/nodeTextStream.ts?raw';
import handleAllEventsExample from '../../../../../examples/docs/streaming/handleAllEvents.ts?raw';
import streamedHITLExample from '../../../../../examples/docs/streaming/streamedHITL.ts?raw';

The Agents SDK can deliver output from the model and other execution
steps incrementally. Streaming keeps your UI responsive and avoids
waiting for the entire final result before updating the user.

## Enabling streaming

Pass a `{ stream: true }` option to `Runner.run()` to obtain a streaming
object rather than a full result:

<Code
  lang="typescript"
  code={basicStreamingExample}
  title="Enabling streaming"
/>

When streaming is enabled the returned `stream` implements the
`AsyncIterable` interface. Each yielded event is an object describing
what happened within the run. Most applications only want the model's
text though, so the stream provides helpers.

### Get the text output

Call `stream.toTextStream()` to obtain a stream of the emitted text.
When `compatibleWithNodeStreams` is `true` the return value is a regular
Node.js `Readable`. We can pipe it directly into `process.stdout` or
another destination.

<Code
  lang="typescript"
  code={nodeTextStreamExample}
  title="Logging out the text as it arrives"
  meta={`{13-17}`}
/>

The promise `stream.completed` resolves once the run and all pending
callbacks are completed. Always await it if you want to ensure there is
no more output.

### Listen to all events

You can use a `for await` loop to inspect each event as it arrives.
Useful information includes low level model events, any agent switches
and SDK specific run information:

<Code
  lang="typescript"
  code={handleAllEventsExample}
  title="Listening to all events"
/>

See [the streamed example](https://github.com/openai/openai-agents-js/tree/main/examples/agent-patterns/streamed.ts)
for a fully worked script that prints both the plain text stream and the
raw event stream.

## Human in the loop while streaming

Streaming is compatible with handoffs that pause execution (for example
when a tool requires approval). The `interruption` field on the stream
object exposes the interruptions, and you can continue execution by
calling `state.approve()` or `state.reject()` for each of them.
Executing again with `{ stream: true }` resumes streaming output.

<Code
  lang="typescript"
  code={streamedHITLExample}
  title="Handling human approval while streaming"
/>

A fuller example that interacts with the user is
[`human-in-the-loop-stream.ts`](https://github.com/openai/openai-agents-js/tree/main/examples/agent-patterns/human-in-the-loop-stream.ts).

## Tips

- Remember to wait for `stream.completed` before exiting to ensure all
  output has been flushed.
- The initial `{ stream: true }` option only applies to the call where it
  is provided. If you re-run with a `RunState` you must specify the
  option again.
- If your application only cares about the textual result prefer
  `toTextStream()` to avoid dealing with individual event objects.

With streaming and the event system you can integrate an agent into a
chat interface, terminal application or any place where users benefit
from incremental updates.
</file>

<file path="docs/src/content/docs/guides/tools.mdx">
---
title: Tools
description: Provide your agents with capabilities via hosted tools or custom function tools
---

import { Code } from '@astrojs/starlight/components';
import toolsFunctionExample from '../../../../../examples/docs/tools/functionTools.ts?raw';
import toolsHostedToolsExample from '../../../../../examples/docs/tools/hostedTools.ts?raw';
import nonStrictSchemaTools from '../../../../../examples/docs/tools/nonStrictSchemaTools.ts?raw';
import agentsAsToolsExample from '../../../../../examples/docs/tools/agentsAsTools.ts?raw';
import mcpLocalServer from '../../../../../examples/docs/tools/mcpLocalServer.ts?raw';

Tools let an Agent **take actions** – fetch data, call external APIs, execute code, or even use a
computer. The JavaScript/TypeScript SDK supports four categories:

1. **Hosted tools** – run alongside the model on OpenAI servers. _(web search, file search, computer use, code interpreter, image generation)_
2. **Function tools** – wrap any local function with a JSON schema so the LLM can call it.
3. **Agents as tools** – expose an entire Agent as a callable tool.
4. **Local MCP servers** – attach a Model Context Protocol server running on your machine.

---

## 1. Hosted tools

When you use the `OpenAIResponsesModel` you can add the following built‑in tools:

| Tool                    | Type string          | Purpose                               |
| ----------------------- | -------------------- | ------------------------------------- |
| Web search              | `'web_search'`       | Internet search.                      |
| File / retrieval search | `'file_search'`      | Query vector stores hosted on OpenAI. |
| Computer use            | `'computer'`         | Automate GUI interactions.            |
| Code Interpreter        | `'code_interpreter'` | Run code in a sandboxed environment.  |
| Image generation        | `'image_generation'` | Generate images based on text.        |

<Code lang="typescript" code={toolsHostedToolsExample} title="Hosted tools" />

The exact parameter sets match the OpenAI Responses API – refer to the official documentation
for advanced options like `rankingOptions` or semantic filters.

---

## 2. Function tools

You can turn **any** function into a tool with the `tool()` helper.

<Code
  lang="typescript"
  code={toolsFunctionExample}
  title="Function tool with Zod parameters"
/>

### Options reference

| Field           | Required | Description                                                                                                                                                                                                          |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | No       | Defaults to the function name (e.g., `get_weather`).                                                                                                                                                                 |
| `description`   | Yes      | Clear, human-readable description shown to the LLM.                                                                                                                                                                  |
| `parameters`    | Yes      | Either a Zod schema or a raw JSON schema object. Zod parameters automatically enable **strict** mode.                                                                                                                |
| `strict`        | No       | When `true` (default), the SDK returns a model error if the arguments don't validate. Set to `false` for fuzzy matching.                                                                                             |
| `execute`       | Yes      | `(args, context) => string                                                                                               \| Promise<string>`– your business logic. The optional second parameter is the`RunContext`. |
| `errorFunction` | No       | Custom handler `(context, error) => string` for transforming internal errors into a user-visible string.                                                                                                             |

### Non‑strict JSON‑schema tools

If you need the model to _guess_ invalid or partial input you can disable strict mode when using
raw JSON schema:

<Code
  lang="typescript"
  code={nonStrictSchemaTools}
  title="Non-strict JSON schema tools"
/>

---

## 3. Agents as tools

Sometimes you want an Agent to _assist_ another Agent without fully handing off the
conversation. Use `agent.asTool()`:

<Code lang="typescript" code={agentsAsToolsExample} title="Agents as tools" />

Under the hood the SDK:

- Creates a function tool with a single `input` parameter.
- Runs the sub‑agent with that input when the tool is called.
- Returns either the last message or the output extracted by `customOutputExtractor`.

---

## 4. Local MCP servers

You can expose tools via a local [Model Context Protocol](https://modelcontextprotocol.io/) server and attach them to an agent.
Use `MCPServerStdio` to spawn and connect to the server:

<Code lang="typescript" code={mcpLocalServer} title="Local MCP server" />

See [`filesystem-example.ts`](https://github.com/openai/openai-agents-js/tree/main/examples/mcp/filesystem-example.ts) for a complete example.

---

## Tool use behaviour

Refer to the [Agents guide](/openai-agents-js/guides/agents#forcing-tool-use) for controlling when and how a model
must use tools (`tool_choice`, `toolUseBehavior`, etc.).

---

## Best practices

- **Short, explicit descriptions** – describe _what_ the tool does _and when to use it_.
- **Validate inputs** – use Zod schemas for strict JSON validation where possible.
- **Avoid side‑effects in error handlers** – `errorFunction` should return a helpful string, not throw.
- **One responsibility per tool** – small, composable tools lead to better model reasoning.

---

## Next steps

- Learn about [forcing tool use](/openai-agents-js/guides/agents#forcing-tool-use).
- Add [guardrails](/openai-agents-js/guides/guardrails) to validate tool inputs or outputs.
- Dive into the TypeDoc reference for [`tool()`](/openai-agents-js/openai/agents/functions/tool) and the various hosted tool types.
</file>

<file path="docs/src/content/docs/guides/tracing.mdx">
---
title: Tracing
description: Learn how to trace your agent runs
---

import { Aside, Code } from '@astrojs/starlight/components';
import customTraceExample from '../../../../../examples/docs/custom-trace.ts?raw';
import cloudflareWorkers from '../../../../../examples/docs/tracing/cloudflareWorkers.ts?raw';

The Agents SDK includes built-in tracing, collecting a comprehensive record of events during an agent
run: LLM generations, tool calls, handoffs, guardrails, and even custom events that occur. Using the
[Traces dashboard](https://platform.openai.com/traces), you can debug, visualize, and monitor your
workflows during development and in production.

<Aside type="note">

Tracing is enabled by default. There are two ways to disable tracing:

1. You can globally disable tracing by setting the env var `OPENAI_AGENTS_DISABLE_TRACING=1`
2. You can disable tracing for a single run by setting [`RunConfig.tracingDisabled`](/openai-agents-js/openai/agents-core/type-aliases/runconfig/#tracingdisabled) to `true`

**_For organizations operating under a Zero Data Retention (ZDR) policy using OpenAI's APIs, tracing is unavailable._**

</Aside>

## Export loop lifecycle

In most environments traces will automatically be exported on a regular interval. In the browser or in Cloudflare Workers, this functionality is disabled by default. Traces will still get exported if too many are queued up but they are not exported on a regular interval. Instead you should use `getGlobalTraceProvider().forceFlush()` to manually export the traces as part of your code's lifecycle.

For example, in a Cloudflare Worker, you should wrap your code into a `try/catch/finally` block and use force flush with `waitUntil` to ensure that traces are exported before the worker exits.

<Code
  lang="typescript"
  code={cloudflareWorkers.replace(/\s+\/\/ @ts-expect-error.*$/m, '')}
  meta="{13}"
/>

## Traces and spans

- **Traces** represent a single end-to-end operation of a "workflow". They're composed of Spans. Traces have the following properties:
  - `workflow_name`: This is the logical workflow or app. For example "Code generation" or "Customer service".
  - `trace_id`: A unique ID for the trace. Automatically generated if you don't pass one. Must have the format `trace_<32_alphanumeric>`.
  - `group_id`: Optional group ID, to link multiple traces from the same conversation. For example, you might use a chat thread ID.
  - `disabled`: If True, the trace will not be recorded.
  - `metadata`: Optional metadata for the trace.
- **Spans** represent operations that have a start and end time. Spans have:
  - `started_at` and `ended_at` timestamps.
  - `trace_id`, to represent the trace they belong to
  - `parent_id`, which points to the parent Span of this Span (if any)
  - `span_data`, which is information about the Span. For example, `AgentSpanData` contains information about the Agent, `GenerationSpanData` contains information about the LLM generation, etc.

## Default tracing

By default, the SDK traces the following:

- The entire `run()` or `Runner.run()` is wrapped in a `Trace`.
- Each time an agent runs, it is wrapped in `AgentSpan`
- LLM generations are wrapped in `GenerationSpan`
- Function tool calls are each wrapped in `FunctionSpan`
- Guardrails are wrapped in `GuardrailSpan`
- Handoffs are wrapped in `HandoffSpan`

By default, the trace is named "Agent workflow". You can set this name if you use `withTrace`, or you can can configure the name and other properties with the [`RunConfig.workflowName`](/openai-agents-js/openai/agents-core/type-aliases/runconfig/#workflowname).

In addition, you can set up [custom trace processors](#custom-tracing-processors) to push traces to other destinations (as a replacement, or secondary destination).

### Voice agent tracing

If you are using `RealtimeAgent` and `RealtimeSession` with the default OpenAI Realtime API, tracing will automatically happen on the Realtime API side unless you disable it on the `RealtimeSession` using `tracingDisabled: true` or using the `OPENAI_AGENTS_DISABLE_TRACING` environment variable.

Check out the [Voice agents guide](/openai-agents-js/guides/voice-agents) for more details.

## Higher level traces

Sometimes, you might want multiple calls to `run()` to be part of a single trace. You can do this by wrapping the entire code in a `withTrace()`.

<Code lang="typescript" code={customTraceExample} />

1. Because the two calls to `run` are wrapped in a `withTrace()`, the individual runs will be part of the overall trace rather than creating two traces.

## Creating traces

You can use the [`withTrace()`](/openai-agents-js/openai/agents-core/functions/withtrace/) function to create a trace. Alternatively, you can use `getGlobalTraceProvider().createTrace()` to create a new trace manually and pass it into `withTrace()`.

The current trace is tracked via a [Node.js `AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) or the respective environment polyfills. This means that it works with concurrency automatically.

## Creating spans

You can use the various `create*Span()` (e.g. `createGenerationSpan()`, `createFunctionSpan()`, etc.) methods to create a span. In general, you don't need to manually create spans. A [`createCustomSpan()`](/openai-agents-js/openai/agents-core/functions/createcustomspan/) function is available for tracking custom span information.

Spans are automatically part of the current trace, and are nested under the nearest current span, which is tracked via a [Node.js `AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage) or the respective environment polyfills.

## Sensitive data

Certain spans may capture potentially sensitive data.

The `createGenerationSpan()` stores the inputs/outputs of the LLM generation, and `createFunctionSpan()` stores the inputs/outputs of function calls. These may contain sensitive data, so you can disable capturing that data via [`RunConfig.traceIncludeSensitiveData
`](/openai-agents-js/openai/agents-core/type-aliases/runconfig/#traceincludesensitivedata).

## Custom tracing processors

The high level architecture for tracing is:

- At initialization, we create a global [`TraceProvider`](/openai-agents-js/openai/agents-core/classes/traceprovider), which is responsible for creating traces and can be accessed through [`getGlobalTraceProvider()`](/openai-agents-js/openai/agents-core/functions/getglobaltraceprovider/).
- We configure the `TraceProvider` with a [`BatchTraceProcessor`](/openai-agents-js/openai/agents-core/classes/batchtraceprocessor/) that sends traces/spans in batches to a [`OpenAITracingExporter`](/openai-agents-js/openai/agents-openai/classes/openaitracingexporter/), which exports the spans and traces to the OpenAI backend in batches.

To customize this default setup, to send traces to alternative or additional backends or modifying exporter behavior, you have two options:

1. [`addTraceProcessor()`](/openai-agents-js/openai/agents-core/functions/addtraceprocessor) lets you add an **additional** trace processor that will receive traces and spans as they are ready. This lets you do your own processing in addition to sending traces to OpenAI's backend.
2. [`setTraceProcessors()`](/openai-agents-js/openai/agents-core/functions/settraceprocessors) lets you **replace** the default processors with your own trace processors. This means traces will not be sent to the OpenAI backend unless you include a `TracingProcessor` that does so.
</file>

<file path="docs/src/content/docs/guides/troubleshooting.mdx">
---
title: Troubleshooting
description: Learn how to troubleshoot issues with the OpenAI Agents SDK.
---

## Supported environments

The OpenAI Agents SDK is supported on the following server environments:

- Node.js 22+
- Deno 2.35+
- Bun 1.2.5+

### Limited support

- **Cloudflare Workers**: The Agents SDK can be used in Cloudflare Workers, but currently comes with some limitations:
  - The SDK current requires `nodejs_compat` to be enabled
  - Traces need to be manually flushed at the end of the request. [See the tracing guide](/openai-agents-js/guides/tracing#export-loop-lifecycle) for more details.
  - Due to Cloudflare Workers' limited support for `AsyncLocalStorage` some traces might not be accurate
- **Browsers**:
  - Tracing is currently not supported in browsers
- **v8 isolates**:
  - While you should be able to bundle the SDK for v8 isolates if you use a bundler with the right browser polyfills, tracing will not work
  - v8 isolates have not been extensively tested

## Debug logging

If you are running into problems with the SDK, you can enable debug logging to get more information about what is happening.

Enable debug logging by setting the `DEBUG` environment variable to `openai-agents:*`.

```bash
DEBUG=openai-agents:*
```

Alternatively, you can scope the debugging to specific parts of the SDK:

- `openai-agents:core` — for the main execution logic of the SDK
- `openai-agents:openai` — for the OpenAI API calls
- `openai-agents:realtime` — for the Realtime Agents components
</file>

<file path="docs/src/content/docs/guides/voice-agents.mdx">
---
title: Voice Agents
description: Build realtime voice assistants using RealtimeAgent and RealtimeSession
---

import { Aside, Code, LinkCard } from '@astrojs/starlight/components';
import createAgentExample from '../../../../../examples/docs/voice-agents/createAgent.ts?raw';
import multiAgentsExample from '../../../../../examples/docs/voice-agents/multiAgents.ts?raw';
import createSessionExample from '../../../../../examples/docs/voice-agents/createSession.ts?raw';
import configureSessionExample from '../../../../../examples/docs/voice-agents/configureSession.ts?raw';
import handleAudioExample from '../../../../../examples/docs/voice-agents/handleAudio.ts?raw';
import defineToolExample from '../../../../../examples/docs/voice-agents/defineTool.ts?raw';
import toolApprovalEventExample from '../../../../../examples/docs/voice-agents/toolApprovalEvent.ts?raw';
import guardrailsExample from '../../../../../examples/docs/voice-agents/guardrails.ts?raw';
import guardrailSettingsExample from '../../../../../examples/docs/voice-agents/guardrailSettings.ts?raw';
import audioInterruptedExample from '../../../../../examples/docs/voice-agents/audioInterrupted.ts?raw';
import sessionInterruptExample from '../../../../../examples/docs/voice-agents/sessionInterrupt.ts?raw';
import sessionHistoryExample from '../../../../../examples/docs/voice-agents/sessionHistory.ts?raw';
import historyUpdatedExample from '../../../../../examples/docs/voice-agents/historyUpdated.ts?raw';
import updateHistoryExample from '../../../../../examples/docs/voice-agents/updateHistory.ts?raw';
import customWebRTCTransportExample from '../../../../../examples/docs/voice-agents/customWebRTCTransport.ts?raw';
import websocketSessionExample from '../../../../../examples/docs/voice-agents/websocketSession.ts?raw';
import transportEventsExample from '../../../../../examples/docs/voice-agents/transportEvents.ts?raw';
import thinClientExample from '../../../../../examples/docs/voice-agents/thinClient.ts?raw';

![Realtime Agents](https://cdn.openai.com/API/docs/images/diagram-speech-to-speech.png)

Voice Agents use OpenAI speech-to-speech models to provide realtime voice chat. These models support streaming audio, text, and tool calls and are great for applications like voice/phone customer support, mobile app experiences, and voice chat.

The Voice Agents SDK provides a TypeScript client for the [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime).

<LinkCard
  title="Voice Agents Quickstart"
  href="/openai-agents-js/guides/voice-agents/quickstart"
  description="Build your first realtime voice assistant using the OpenAI Agents SDK in minutes."
/>

### Key features

- Connect over WebSocket or WebRTC
- Can be used both in the browser and for backend connections
- Audio and interruption handling
- Multi-agent orchestration through handoffs
- Tool definition and calling
- Custom guardrails to monitor model output
- Callbacks for streamed events
- Reuse the same components for both text and voice agents

By using speech-to-speech models, we can leverage the model's ability to process the audio in realtime without the need of transcribing and reconverting the text back to audio after the model acted.

![Speech-to-speech model](https://cdn.openai.com/API/docs/images/diagram-chained-agent.png)
</file>

</files>
