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
- Only files matching these patterns are included: modal-js
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Security check has been disabled - content may contain sensitive information
- Files are sorted by Git change count (files with more changes are at the bottom)
</notes>

</file_summary>

<directory_structure>
modal-js/
  examples/
    cls-call.ts
    function-call.ts
    function-spawn.ts
    init-client.ts
    reliability.ts
    reliability2.ts
    sandbox-exec.ts
    sandbox-filesystem.ts
    sandbox-private-image.ts
    sandbox-tunnels.ts
    sandbox-volume.ts
    sandbox.ts
  scripts/
    gen-proto.sh
  src/
    app.ts
    client.ts
    cls.ts
    config.ts
    errors.ts
    function_call.ts
    function.ts
    image.ts
    index.ts
    invocation.ts
    pickle.test.ts
    pickle.ts
    queue.ts
    sandbox_filesystem.ts
    sandbox.ts
    secret.ts
    serialization.test.ts
    streams.ts
    volume.ts
  test/
    cls.test.ts
    function_call.test.ts
    function.test.ts
    image.test.ts
    queue.test.ts
    sandbox_filesystem.test.ts
    sandbox.test.ts
    secret.test.ts
    volume.test.ts
  .gitignore
  eslint.config.js
  package.json
  README.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="modal-js/examples/cls-call.ts">
// This example calls a Modal Cls defined in `libmodal_test_support.py`.

import { Cls } from "modal";

// Lookup a deployed Cls.
const cls = await Cls.lookup("libmodal-test-support", "EchoCls");
const instance = await cls.instance();
const method = instance.method("echo_string");

// Call the Cls function with args.
let ret = await method.remote(["Hello world!"]);
console.log(ret);

// Call the Cls function with kwargs.
ret = await method.remote([], { s: "Hello world!" });
console.log(ret);
</file>

<file path="modal-js/examples/function-call.ts">
// This example calls a function defined in `libmodal_test_support.py`.

import { Function_ } from "modal";

const echo = await Function_.lookup("libmodal-test-support", "echo_string");

// Call the function with args.
let ret = await echo.remote(["Hello world!"]);
console.log(ret);

// Call the function with kwargs.
ret = await echo.remote([], { s: "Hello world!" });
console.log(ret);
</file>

<file path="modal-js/examples/function-spawn.ts">
// This example calls a function defined in `libmodal_test_support.py`.

import { Function_ } from "modal";

const echo = await Function_.lookup("libmodal-test-support", "echo_string");

// Spawn the function with kwargs.
const functionCall = await echo.spawn([], { s: "Hello world!" });
const ret = await functionCall.get();
console.log(ret);
</file>

<file path="modal-js/examples/init-client.ts">
// This example configures a client using a `CUSTOM_MODAL_ID` and `CUSTOM_MODAL_SECRET` environment variable.

import { Function_, initializeClient } from "modal";

const modalId = process.env.CUSTOM_MODAL_ID;
if (!modalId) {
  throw new Error("CUSTOM_MODAL_ID environment variable not set");
}
const modalSecret = process.env.CUSTOM_MODAL_SECRET;
if (!modalSecret) {
  throw new Error("CUSTOM_MODAL_SECRET environment variable not set");
}

initializeClient({ tokenId: modalId, tokenSecret: modalSecret });

const echo = await Function_.lookup("libmodal-test-support", "echo_string");
console.log(echo);
</file>

<file path="modal-js/examples/reliability.ts">
// Run a bunch of container exec commands, alerting of any output issues.

import PQueue from "p-queue";
import { App } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromRegistry("python:3.13-slim");

const sandboxes = [
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
  await app.createSandbox(image),
];

try {
  const expectedContent = Array.from(
    { length: 50000 },
    (_, i) => `${i}\n`,
  ).join("");

  const queue = new PQueue({ concurrency: 50 });

  let success = 0;
  let failure = 0;

  for (let i = 0; i < 10000; i++) {
    await queue.onEmpty();

    queue.add(async () => {
      const sb = sandboxes[i % sandboxes.length];
      const p = await sb.exec(
        [
          "python",
          "-c",
          `
import time
import sys
for i in range(50000):
  if i % 1000 == 0:
    time.sleep(0.01)
  print(i)
  print(i, file=sys.stderr)`,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [contentStdout, contentStderr] = await Promise.all([
        p.stdout.readText(),
        p.stderr.readText(),
      ]);
      if (
        contentStdout === expectedContent &&
        contentStderr === expectedContent
      ) {
        success++;
        console.log("Output matches expected content.", i);
      } else {
        failure++;
        console.error("MISMATCH", i);
      }
    });
  }

  await queue.onIdle();
  console.log("Success:", success);
  console.log("Failure:", failure);
} finally {
  for (const sb of sandboxes) {
    await sb.terminate();
  }
}
</file>

<file path="modal-js/examples/reliability2.ts">
// Quick script for making sure sandboxes can be created and wait() without stalling.

import PQueue from "p-queue";
import { App } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromRegistry("python:3.13-slim");

async function createAndWaitOne() {
  const sb = await app.createSandbox(image);
  if (!sb.sandboxId) throw new Error("Sandbox ID is missing");
  await sb.terminate();
  const exitCode = await Promise.race([
    sb.wait(),
    new Promise<number>((_, reject) => {
      setTimeout(() => reject(new Error("wait() timed out")), 10000).unref();
    }),
  ]);
  console.log("Sandbox wait completed with exit code:", exitCode);
  if (exitCode !== 0) throw new Error(`Sandbox exited with code ${exitCode}`);
}

const queue = new PQueue({ concurrency: 50 });

let success = 0;
let failure = 0;

for (let i = 0; i < 150; i++) {
  await queue.onEmpty();

  queue.add(async () => {
    try {
      await createAndWaitOne();
      success++;
      console.log("Sandbox created and waited successfully.", i);
    } catch (error) {
      failure++;
      console.error("Error in sandbox creation/waiting:", error, i);
    }
  });
}

await queue.onIdle();
console.log("Success:", success);
console.log("Failure:", failure);
</file>

<file path="modal-js/examples/sandbox-exec.ts">
import { App } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromRegistry("python:3.13-slim");

const sb = await app.createSandbox(image);
console.log("Started sandbox:", sb.sandboxId);

try {
  const p = await sb.exec(
    [
      "python",
      "-c",
      `
import time
import sys
for i in range(50000):
    if i % 1000 == 0:
        time.sleep(0.01)
    print(i)
    print(i, file=sys.stderr)`,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // Read both the stdout and stderr streams.
  const [contentStdout, contentStderr] = await Promise.all([
    p.stdout.readText(),
    p.stderr.readText(),
  ]);
  console.log(
    `Got ${contentStdout.length} bytes stdout and ${contentStderr.length} bytes stderr`,
  );
  console.log("Return code:", await p.wait());
} finally {
  await sb.terminate();
}
</file>

<file path="modal-js/examples/sandbox-filesystem.ts">
import { App } from "modal";

/**
 * Example demonstrating filesystem operations in a Modal sandbox.
 *
 * This example shows how to:
 * - Open files for reading and writing
 * - Read file contents as binary data
 * - Write data to files
 * - Close file handles
 */

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromRegistry("alpine:3.21");

// Create a sandbox
const sb = await app.createSandbox(image);
console.log("Started sandbox:", sb.sandboxId);

try {
  // Write a file
  const writeHandle = await sb.open("/tmp/example.txt", "w");
  const encoder = new TextEncoder();
  const deocder = new TextDecoder();

  await writeHandle.write(encoder.encode("Hello, Modal filesystem!\n"));
  await writeHandle.write(encoder.encode("This is line 2.\n"));
  await writeHandle.write(encoder.encode("And this is line 3.\n"));
  await writeHandle.close();

  // Read the entire file as binary
  const readHandle = await sb.open("/tmp/example.txt", "r");
  const content = await readHandle.read();
  console.log("File content:", deocder.decode(content));
  await readHandle.close();

  // Append to the file
  const appendHandle = await sb.open("/tmp/example.txt", "a");
  await appendHandle.write(encoder.encode("This line was appended.\n"));
  await appendHandle.close();

  // Read with binary
  const seekHandle = await sb.open("/tmp/example.txt", "r");
  const appendedContent = await seekHandle.read();
  console.log("File with appended:", deocder.decode(appendedContent));
  await seekHandle.close();

  // Binary file operations
  const binaryHandle = await sb.open("/tmp/data.bin", "w");
  const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await binaryHandle.write(binaryData);
  await binaryHandle.close();

  // Read binary data
  const readBinaryHandle = await sb.open("/tmp/data.bin", "r");
  const readData = await readBinaryHandle.read();
  console.log("Binary data:", readData);
  await readBinaryHandle.close();
} catch (error) {
  console.error("Filesystem operation failed:", error);
} finally {
  // Clean up the sandbox
  await sb.terminate();
}
</file>

<file path="modal-js/examples/sandbox-private-image.ts">
import { App, Secret } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromAwsEcr(
  "459781239556.dkr.ecr.us-east-1.amazonaws.com/ecr-private-registry-test-7522615:python",
  await Secret.fromName("libmodal-aws-ecr-test", {
    requiredKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  }),
);

// Spawn a sandbox running a simple Python version of the "cat" command.
const sb = await app.createSandbox(image, {
  command: ["python", "-c", `import sys; sys.stdout.write(sys.stdin.read())`],
});
console.log("sandbox:", sb.sandboxId);

// Write to the sandbox's stdin and read from its stdout.
await sb.stdin.writeText(
  "this is input that should be mirrored by the Python one-liner",
);
await sb.stdin.close();
console.log("output:", await sb.stdout.readText());

// Terminate the sandbox.
await sb.terminate();
</file>

<file path="modal-js/examples/sandbox-tunnels.ts">
import { App } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });

// Create a sandbox with Python's built-in HTTP server
const image = await app.imageFromRegistry("python:3.12-alpine");
const sandbox = await app.createSandbox(image, {
  command: ["python3", "-m", "http.server", "8000"],
  encryptedPorts: [8000],
  timeout: 60000, // 1 minute
});

console.log("Sandbox created:", sandbox.sandboxId);

console.log("Getting tunnel information...");
const tunnels = await sandbox.tunnels();

console.log("Waiting for server to start...");
await new Promise((resolve) => setTimeout(resolve, 3000));
const tunnel = tunnels[8000];

console.log("Tunnel information:");
console.log("  URL:", tunnel.url);
console.log("  Port:", tunnel.port);

console.log("\nMaking GET request to the tunneled server at " + tunnel.url);

const response = await fetch(tunnel.url);

const html = await response.text();
console.log("\nDirectory listing from server (first 500 chars):");
console.log(html.substring(0, 500));

console.log("\n✅ Successfully connected to the tunneled server!");

await sandbox.terminate();
</file>

<file path="modal-js/examples/sandbox-volume.ts">
import { App, Volume } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromRegistry("alpine:3.21");

const volume = await Volume.fromName("libmodal-example-volume", {
  createIfMissing: true,
});

const writerSandbox = await app.createSandbox(image, {
  command: [
    "sh",
    "-c",
    "echo 'Hello from writer sandbox!' > /mnt/volume/message.txt",
  ],
  volumes: { "/mnt/volume": volume },
});
console.log("Writer sandbox:", writerSandbox.sandboxId);

await writerSandbox.wait();
console.log("Writer finished");

const readerSandbox = await app.createSandbox(image, {
  command: ["sh", "-c", "cat /mnt/volume/message.txt"],
  volumes: { "/mnt/volume": volume },
});
console.log("Reader sandbox:", readerSandbox.sandboxId);

console.log("Reader output:", await readerSandbox.stdout.readText());

await writerSandbox.terminate();
await readerSandbox.terminate();
</file>

<file path="modal-js/examples/sandbox.ts">
import { App } from "modal";

const app = await App.lookup("libmodal-example", { createIfMissing: true });
const image = await app.imageFromRegistry("alpine:3.21");

// Spawn a sandbox running the "cat" command.
const sb = await app.createSandbox(image, { command: ["cat"] });
console.log("sandbox:", sb.sandboxId);

// Write to the sandbox's stdin and read from its stdout.
await sb.stdin.writeText("this is input that should be mirrored by cat");
await sb.stdin.close();
console.log("output:", await sb.stdout.readText());

// Terminate the sandbox.
await sb.terminate();
</file>

<file path="modal-js/scripts/gen-proto.sh">
#!/bin/bash
# Called from package.json scripts.

mkdir -p proto

./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./proto \
  --ts_proto_opt=outputServices=nice-grpc,outputServices=generic-definitions,useExactTypes=false \
  --proto_path=../modal-client \
  ../modal-client/modal_proto/*.proto

# Add @ts-nocheck to all generated files.
find proto -name '*.ts' | while read -r file; do
  if ! grep -q '@ts-nocheck' "$file"; then
    (echo '// @ts-nocheck'; cat "$file") > "$file.tmp" && mv "$file.tmp" "$file"
  fi
done

# HACK: Patch for bad Protobuf codegen: fix the "Object" type conflicting with
# builtin `Object` API in JavaScript and breaking Protobuf import.
perl -pi -e 's/Object\.entries/PLACEHOLDER_OBJECT_ENTRIES/g' proto/modal_proto/api.ts
perl -pi -e 's/\bObject\b/Object_/g' proto/modal_proto/api.ts
perl -pi -e 's/PLACEHOLDER_OBJECT_ENTRIES/Object.entries/g' proto/modal_proto/api.ts
</file>

<file path="modal-js/src/app.ts">
import { ClientError, Status } from "nice-grpc";
import {
  NetworkAccess_NetworkAccessType,
  ObjectCreationType,
  RegistryAuthType,
  PortSpec,
  TunnelType,
} from "../proto/modal_proto/api";
import { client } from "./client";
import { environmentName } from "./config";
import { fromRegistryInternal, type Image } from "./image";
import { Sandbox } from "./sandbox";
import { NotFoundError } from "./errors";
import { Secret } from "./secret";
import { Volume } from "./volume";

/** Options for functions that find deployed Modal objects. */
export type LookupOptions = {
  environment?: string;
  createIfMissing?: boolean;
};

/** Options for deleting a named object. */
export type DeleteOptions = {
  environment?: string;
};

/** Options for constructors that create a temporary, nameless object. */
export type EphemeralOptions = {
  environment?: string;
};

/** Options for `App.createSandbox()`. */
export type SandboxCreateOptions = {
  /** Reservation of physical CPU cores for the sandbox, can be fractional. */
  cpu?: number;

  /** Reservation of memory in MiB. */
  memory?: number;

  /** Timeout of the sandbox container, defaults to 10 minutes. */
  timeout?: number;

  /**
   * Sequence of program arguments for the main process.
   * Default behavior is to sleep indefinitely until timeout or termination.
   */
  command?: string[]; // default is ["sleep", "48h"]

  /** Mount points for Modal Volumes. */
  volumes?: Record<string, Volume>;

  /** List of ports to tunnel into the sandbox. Encrypted ports are tunneled with TLS. */
  encryptedPorts?: number[];

  /** List of encrypted ports to tunnel into the sandbox, using HTTP/2. */
  h2Ports?: number[];

  /** List of ports to tunnel into the sandbox without encryption. */
  unencryptedPorts?: number[];
};

/** Represents a deployed Modal App. */
export class App {
  readonly appId: string;

  /** @ignore */
  constructor(appId: string) {
    this.appId = appId;
  }

  /** Lookup a deployed app by name, or create if it does not exist. */
  static async lookup(name: string, options: LookupOptions = {}): Promise<App> {
    try {
      const resp = await client.appGetOrCreate({
        appName: name,
        environmentName: environmentName(options.environment),
        objectCreationType: options.createIfMissing
          ? ObjectCreationType.OBJECT_CREATION_TYPE_CREATE_IF_MISSING
          : ObjectCreationType.OBJECT_CREATION_TYPE_UNSPECIFIED,
      });
      return new App(resp.appId);
    } catch (err) {
      if (err instanceof ClientError && err.code === Status.NOT_FOUND)
        throw new NotFoundError(`App '${name}' not found`);
      throw err;
    }
  }

  async createSandbox(
    image: Image,
    options: SandboxCreateOptions = {},
  ): Promise<Sandbox> {
    if (options.timeout && options.timeout % 1000 !== 0) {
      // The gRPC API only accepts a whole number of seconds.
      throw new Error(
        `Timeout must be a multiple of 1000ms, got ${options.timeout}`,
      );
    }

    const volumeMounts = options.volumes
      ? Object.entries(options.volumes).map(([mountPath, volume]) => ({
          volumeId: volume.volumeId,
          mountPath,
          allowBackgroundCommits: true,
          readOnly: false,
        }))
      : [];

    // Build port specifications
    const openPorts: PortSpec[] = [];
    if (options.encryptedPorts) {
      openPorts.push(
        ...options.encryptedPorts.map((port) => ({
          port,
          unencrypted: false,
        })),
      );
    }
    if (options.h2Ports) {
      openPorts.push(
        ...options.h2Ports.map((port) => ({
          port,
          unencrypted: false,
          tunnelType: TunnelType.TUNNEL_TYPE_H2,
        })),
      );
    }
    if (options.unencryptedPorts) {
      openPorts.push(
        ...options.unencryptedPorts.map((port) => ({
          port,
          unencrypted: true,
        })),
      );
    }

    const createResp = await client.sandboxCreate({
      appId: this.appId,
      definition: {
        // Sleep default is implicit in image builder version <=2024.10
        entrypointArgs: options.command ?? ["sleep", "48h"],
        imageId: image.imageId,
        timeoutSecs:
          options.timeout != undefined ? options.timeout / 1000 : 600,
        networkAccess: {
          networkAccessType: NetworkAccess_NetworkAccessType.OPEN,
        },
        resources: {
          // https://modal.com/docs/guide/resources
          milliCpu: Math.round(1000 * (options.cpu ?? 0.125)),
          memoryMb: options.memory ?? 128,
        },
        volumeMounts,
        openPorts: openPorts.length > 0 ? { ports: openPorts } : undefined,
      },
    });

    return new Sandbox(createResp.sandboxId);
  }

  async imageFromRegistry(tag: string, secret?: Secret): Promise<Image> {
    let imageRegistryConfig;
    if (secret) {
      if (!(secret instanceof Secret)) {
        throw new TypeError(
          "secret must be a reference to an existing Secret, e.g. `await Secret.fromName('my_secret')`",
        );
      }
      imageRegistryConfig = {
        registryAuthType: RegistryAuthType.REGISTRY_AUTH_TYPE_STATIC_CREDS,
        secretId: secret.secretId,
      };
    }
    return await fromRegistryInternal(this.appId, tag, imageRegistryConfig);
  }

  async imageFromAwsEcr(tag: string, secret: Secret): Promise<Image> {
    if (!(secret instanceof Secret)) {
      throw new TypeError(
        "secret must be a reference to an existing Secret, e.g. `await Secret.fromName('my_secret')`",
      );
    }

    const imageRegistryConfig = {
      registryAuthType: RegistryAuthType.REGISTRY_AUTH_TYPE_AWS,
      secretId: secret.secretId,
    };

    return await fromRegistryInternal(this.appId, tag, imageRegistryConfig);
  }

  async imageFromGcpArtifactRegistry(
    tag: string,
    secret: Secret,
  ): Promise<Image> {
    if (!(secret instanceof Secret)) {
      throw new TypeError(
        "secret must be a reference to an existing Secret, e.g. `await Secret.fromName('my_secret')`",
      );
    }

    const imageRegistryConfig = {
      registryAuthType: RegistryAuthType.REGISTRY_AUTH_TYPE_GCP,
      secretId: secret.secretId,
    };

    return await fromRegistryInternal(this.appId, tag, imageRegistryConfig);
  }
}
</file>

<file path="modal-js/src/client.ts">
import { v4 as uuidv4 } from "uuid";
import {
  CallOptions,
  ClientError,
  ClientMiddleware,
  ClientMiddlewareCall,
  createChannel,
  createClientFactory,
  Metadata,
  Status,
} from "nice-grpc";

import { ClientType, ModalClientDefinition } from "../proto/modal_proto/api";
import { getProfile, type Profile } from "./config";

const defaultProfile = getProfile(process.env["MODAL_PROFILE"]);

let modalAuthToken: string | undefined;

/** gRPC client middleware to add auth token to request. */
function authMiddleware(profile: Profile): ClientMiddleware {
  return async function* authMiddleware<Request, Response>(
    call: ClientMiddlewareCall<Request, Response>,
    options: CallOptions,
  ) {
    if (!profile.tokenId || !profile.tokenSecret) {
      throw new Error(
        `Profile is missing token_id or token_secret. Please set them in .modal.toml, or as environment variables, or initializeClient().`,
      );
    }
    const { tokenId, tokenSecret } = profile;

    options.metadata ??= new Metadata();
    options.metadata.set(
      "x-modal-client-type",
      String(ClientType.CLIENT_TYPE_LIBMODAL_JS),
    );
    options.metadata.set("x-modal-client-version", "1.0.0"); // CLIENT VERSION: Behaves like this Python SDK version
    options.metadata.set("x-modal-token-id", tokenId);
    options.metadata.set("x-modal-token-secret", tokenSecret);
    if (modalAuthToken) {
      options.metadata.set("x-modal-auth-token", modalAuthToken);
    }

    // We receive an auth token from the control plane on our first request. We then include that auth token in every
    // subsequent request to both the control plane and the input plane. The python server returns it in the trailers,
    // the worker returns it in the headers.
    const prevOnHeader = options.onHeader;
    options.onHeader = (header) => {
      const token = header.get("x-modal-auth-token");
      if (token) {
        modalAuthToken = token;
      }
      prevOnHeader?.(header);
    };
    const prevOnTrailer = options.onTrailer;
    options.onTrailer = (trailer) => {
      const token = trailer.get("x-modal-auth-token");
      if (token) {
        modalAuthToken = token;
      }
      prevOnTrailer?.(trailer);
    };
    return yield* call.next(call.request, options);
  };
}

type TimeoutOptions = {
  /** Timeout for this call, interpreted as a duration in milliseconds */
  timeout?: number;
};

/** gRPC client middleware to set timeout and retries on a call. */
const timeoutMiddleware: ClientMiddleware<TimeoutOptions> =
  async function* timeoutMiddleware(call, options) {
    if (!options.timeout || options.signal?.aborted) {
      return yield* call.next(call.request, options);
    }

    const { timeout, signal: origSignal, ...restOptions } = options;
    const abortController = new AbortController();
    const abortListener = () => abortController.abort();
    origSignal?.addEventListener("abort", abortListener);

    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, timeout);

    try {
      return yield* call.next(call.request, {
        ...restOptions,
        signal: abortController.signal,
      });
    } finally {
      origSignal?.removeEventListener("abort", abortListener);
      clearTimeout(timer);

      if (timedOut) {
        // eslint-disable-next-line no-unsafe-finally
        throw new ClientError(
          call.method.path,
          Status.DEADLINE_EXCEEDED,
          `Timed out after ${timeout}ms`,
        );
      }
    }
  };

const retryableGrpcStatusCodes = new Set([
  Status.DEADLINE_EXCEEDED,
  Status.UNAVAILABLE,
  Status.CANCELLED,
  Status.INTERNAL,
  Status.UNKNOWN,
]);

export function isRetryableGrpc(err: unknown) {
  if (err instanceof ClientError) {
    return retryableGrpcStatusCodes.has(err.code);
  }
  return false;
}

/** Sleep helper that can be cancelled via an AbortSignal. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

type RetryOptions = {
  /** Number of retries to take. */
  retries?: number;

  /** Base delay in milliseconds. */
  baseDelay?: number;

  /** Maximum delay in milliseconds. */
  maxDelay?: number;

  /** Exponential factor to multiply successive delays. */
  delayFactor?: number;

  /** Additional status codes to retry. */
  additionalStatusCodes?: Status[];
};

/** Middleware to retry transient errors and timeouts for unary requests. */
const retryMiddleware: ClientMiddleware<RetryOptions> =
  async function* retryMiddleware(call, options) {
    const {
      retries = 3,
      baseDelay = 100,
      maxDelay = 1000,
      delayFactor = 2,
      additionalStatusCodes = [],
      signal,
      ...restOptions
    } = options;

    if (call.requestStream || call.responseStream || !retries) {
      // Don't retry streaming calls, or if retries are disabled.
      return yield* call.next(call.request, restOptions);
    }

    const retryableCodes = new Set([
      ...retryableGrpcStatusCodes,
      ...additionalStatusCodes,
    ]);

    // One idempotency key for the whole call (all attempts).
    const idempotencyKey = uuidv4();

    const startTime = Date.now();
    let attempt = 0;
    let delayMs = baseDelay;

    while (true) {
      // Clone/augment metadata for this attempt.
      const metadata = new Metadata(restOptions.metadata ?? {});

      metadata.set("x-idempotency-key", idempotencyKey);
      metadata.set("x-retry-attempt", String(attempt));
      if (attempt > 0) {
        metadata.set(
          "x-retry-delay",
          ((Date.now() - startTime) / 1000).toFixed(3),
        );
      }

      try {
        // Forward the call.
        return yield* call.next(call.request, {
          ...restOptions,
          metadata,
          signal,
        });
      } catch (err) {
        // Immediately propagate non-retryable situations.
        if (
          !(err instanceof ClientError) ||
          !retryableCodes.has(err.code) ||
          attempt >= retries
        ) {
          throw err;
        }

        // Exponential back-off with a hard cap.
        await sleep(delayMs, signal);
        delayMs = Math.min(delayMs * delayFactor, maxDelay);
        attempt += 1;
      }
    }
  };

/** Map of server URL to input-plane client. */
const inputPlaneClients: Record<string, ReturnType<typeof createClient>> = {};

/** Returns a client for the given server URL, creating it if it doesn't exist. */
export const getOrCreateInputPlaneClient = (
  serverUrl: string,
): ReturnType<typeof createClient> => {
  const client = inputPlaneClients[serverUrl];
  if (client) {
    return client;
  }
  const profile = { ...clientProfile, serverUrl };
  const newClient = createClient(profile);
  inputPlaneClients[serverUrl] = newClient;
  return newClient;
};

function createClient(profile: Profile) {
  // Channels don't do anything until you send a request on them.
  // Ref: https://github.com/modal-labs/modal-client/blob/main/modal/_utils/grpc_utils.py
  const channel = createChannel(profile.serverUrl, undefined, {
    "grpc.max_receive_message_length": 100 * 1024 * 1024,
    "grpc.max_send_message_length": 100 * 1024 * 1024,
    "grpc-node.flow_control_window": 64 * 1024 * 1024,
  });
  return createClientFactory()
    .use(authMiddleware(profile))
    .use(retryMiddleware)
    .use(timeoutMiddleware)
    .create(ModalClientDefinition, channel);
}

export let clientProfile = defaultProfile;

export let client = createClient(clientProfile);

/** Options for initializing a client at runtime. */
export type ClientOptions = {
  tokenId: string;
  tokenSecret: string;
  environment?: string;
};

/**
 * Initialize the Modal client, passing in token authentication credentials.
 *
 * You should call this function at the start of your application if not
 * configuring Modal with a `.modal.toml` file or environment variables.
 */
export function initializeClient(options: ClientOptions) {
  const mergedProfile = {
    ...defaultProfile,
    tokenId: options.tokenId,
    tokenSecret: options.tokenSecret,
    environment: options.environment || defaultProfile.environment,
  };
  clientProfile = mergedProfile;
  client = createClient(mergedProfile);
}
</file>

<file path="modal-js/src/cls.ts">
import { ClientError, Status } from "nice-grpc";
import {
  ClassParameterInfo_ParameterSerializationFormat,
  ClassParameterSet,
  ClassParameterSpec,
  ClassParameterValue,
  ParameterType,
} from "../proto/modal_proto/api";
import type { LookupOptions } from "./app";
import { NotFoundError } from "./errors";
import { client } from "./client";
import { environmentName } from "./config";
import { Function_ } from "./function";

/** Represents a deployed Modal Cls. */
export class Cls {
  #serviceFunctionId: string;
  #schema: ClassParameterSpec[];
  #methodNames: string[];
  #inputPlaneUrl?: string;

  /** @ignore */
  constructor(
    serviceFunctionId: string,
    schema: ClassParameterSpec[],
    methodNames: string[],
    inputPlaneUrl?: string,
  ) {
    this.#serviceFunctionId = serviceFunctionId;
    this.#schema = schema;
    this.#methodNames = methodNames;
    this.#inputPlaneUrl = inputPlaneUrl;
  }

  static async lookup(
    appName: string,
    name: string,
    options: LookupOptions = {},
  ): Promise<Cls> {
    try {
      const serviceFunctionName = `${name}.*`;
      const serviceFunction = await client.functionGet({
        appName,
        objectTag: serviceFunctionName,
        environmentName: environmentName(options.environment),
      });

      const parameterInfo = serviceFunction.handleMetadata?.classParameterInfo;
      const schema = parameterInfo?.schema ?? [];
      if (
        schema.length > 0 &&
        parameterInfo?.format !==
          ClassParameterInfo_ParameterSerializationFormat.PARAM_SERIALIZATION_FORMAT_PROTO
      ) {
        throw new Error(
          `Unsupported parameter format: ${parameterInfo?.format}`,
        );
      }

      let methodNames: string[];
      if (serviceFunction.handleMetadata?.methodHandleMetadata) {
        methodNames = Object.keys(
          serviceFunction.handleMetadata.methodHandleMetadata,
        );
      } else {
        // Legacy approach not supported
        throw new Error(
          "Cls requires Modal deployments using client v0.67 or later.",
        );
      }
      return new Cls(
        serviceFunction.functionId,
        schema,
        methodNames,
        serviceFunction.handleMetadata?.inputPlaneUrl,
      );
    } catch (err) {
      if (err instanceof ClientError && err.code === Status.NOT_FOUND)
        throw new NotFoundError(`Class '${appName}/${name}' not found`);
      throw err;
    }
  }

  /** Create a new instance of the Cls with parameters. */
  async instance(params: Record<string, any> = {}): Promise<ClsInstance> {
    let functionId: string;
    if (this.#schema.length === 0) {
      functionId = this.#serviceFunctionId;
    } else {
      functionId = await this.#bindParameters(params);
    }
    const methods = new Map<string, Function_>();
    for (const name of this.#methodNames) {
      methods.set(name, new Function_(functionId, name, this.#inputPlaneUrl));
    }
    return new ClsInstance(methods);
  }

  /** Bind parameters to the Cls function. */
  async #bindParameters(params: Record<string, any>): Promise<string> {
    const serializedParams = encodeParameterSet(this.#schema, params);
    const bindResp = await client.functionBindParams({
      functionId: this.#serviceFunctionId,
      serializedParams,
    });
    return bindResp.boundFunctionId;
  }
}

export function encodeParameterSet(
  schema: ClassParameterSpec[],
  params: Record<string, any>,
): Uint8Array {
  const encoded: ClassParameterValue[] = [];
  for (const paramSpec of schema) {
    const paramValue = encodeParameter(paramSpec, params[paramSpec.name]);
    encoded.push(paramValue);
  }
  // Sort keys, identical to Python `SerializeToString(deterministic=True)`.
  encoded.sort((a, b) => a.name.localeCompare(b.name));
  return ClassParameterSet.encode({ parameters: encoded }).finish();
}

function encodeParameter(
  paramSpec: ClassParameterSpec,
  value: any,
): ClassParameterValue {
  const name = paramSpec.name;
  const paramType = paramSpec.type;
  const paramValue: ClassParameterValue = { name, type: paramType };

  switch (paramType) {
    case ParameterType.PARAM_TYPE_STRING:
      if (value == null && paramSpec.hasDefault) {
        value = paramSpec.stringDefault ?? "";
      }
      if (typeof value !== "string") {
        throw new Error(`Parameter '${name}' must be a string`);
      }
      paramValue.stringValue = value;
      break;

    case ParameterType.PARAM_TYPE_INT:
      if (value == null && paramSpec.hasDefault) {
        value = paramSpec.intDefault ?? 0;
      }
      if (typeof value !== "number") {
        throw new Error(`Parameter '${name}' must be an integer`);
      }
      paramValue.intValue = value;
      break;

    case ParameterType.PARAM_TYPE_BOOL:
      if (value == null && paramSpec.hasDefault) {
        value = paramSpec.boolDefault ?? false;
      }
      if (typeof value !== "boolean") {
        throw new Error(`Parameter '${name}' must be a boolean`);
      }
      paramValue.boolValue = value;
      break;

    case ParameterType.PARAM_TYPE_BYTES:
      if (value == null && paramSpec.hasDefault) {
        value = paramSpec.bytesDefault ?? new Uint8Array();
      }
      if (!(value instanceof Uint8Array)) {
        throw new Error(`Parameter '${name}' must be a byte array`);
      }
      paramValue.bytesValue = value;
      break;

    default:
      throw new Error(`Unsupported parameter type: ${paramType}`);
  }

  return paramValue;
}

/** Represents an instance of a deployed Modal Cls, optionally with parameters. */
export class ClsInstance {
  #methods: Map<string, Function_>;

  constructor(methods: Map<string, Function_>) {
    this.#methods = methods;
  }

  method(name: string): Function_ {
    const method = this.#methods.get(name);
    if (!method) {
      throw new NotFoundError(`Method '${name}' not found on class`);
    }
    return method;
  }
}
</file>

<file path="modal-js/src/config.ts">
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { clientProfile } from "./client";

/** Raw representation of the .modal.toml file. */
interface Config {
  [profile: string]: {
    server_url?: string;
    token_id?: string;
    token_secret?: string;
    environment?: string;
    imageBuilderVersion?: string;
    active?: boolean;
  };
}

/** Resolved configuration object from `Config` and environment variables. */
export interface Profile {
  serverUrl: string;
  tokenId?: string;
  tokenSecret?: string;
  environment?: string;
  imageBuilderVersion?: string;
}

function readConfigFile(): Config {
  try {
    const configContent = readFileSync(path.join(homedir(), ".modal.toml"), {
      encoding: "utf-8",
    });
    return parseToml(configContent) as Config;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {} as Config;
    }
    // Ignore failure to read or parse .modal.toml
    // throw new Error(`Failed to read or parse .modal.toml: ${err.message}`);
    return {} as Config;
  }
}

// Synchronous on startup to avoid top-level await in CJS output.
//
// Any performance impact is minor because the .modal.toml file is small and
// only read once. This is comparable to how OpenSSL certificates can be probed
// synchronously, for instance.
const config: Config = readConfigFile();

export function getProfile(profileName?: string): Profile {
  if (!profileName) {
    for (const [name, profileData] of Object.entries(config)) {
      if (profileData.active) {
        profileName = name;
        break;
      }
    }
  }
  const profileData =
    profileName && Object.hasOwn(config, profileName)
      ? config[profileName]
      : {};

  const profile: Partial<Profile> = {
    serverUrl:
      process.env["MODAL_SERVER_URL"] ||
      profileData.server_url ||
      "https://api.modal.com:443",
    tokenId: process.env["MODAL_TOKEN_ID"] || profileData.token_id,
    tokenSecret: process.env["MODAL_TOKEN_SECRET"] || profileData.token_secret,
    environment: process.env["MODAL_ENVIRONMENT"] || profileData.environment,
    imageBuilderVersion:
      process.env["MODAL_IMAGE_BUILDER_VERSION"] ||
      profileData.imageBuilderVersion,
  };
  return profile as Profile; // safe to null-cast because of check above
}

export function environmentName(environment?: string): string {
  return environment || clientProfile.environment || "";
}

export function imageBuilderVersion(version?: string): string {
  return version || clientProfile.imageBuilderVersion || "2024.10";
}
</file>

<file path="modal-js/src/errors.ts">
/** Function execution exceeds the allowed time limit. */
export class FunctionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FunctionTimeoutError";
  }
}

/** An error on the Modal server, or a Python exception. */
export class RemoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteError";
  }
}

/** A retryable internal error from Modal. */
export class InternalFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalFailure";
  }
}

/** Some resource was not found. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A request or other operation was invalid. */
export class InvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidError";
  }
}

/** The queue is empty. */
export class QueueEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueEmptyError";
  }
}

/** The queue is full. */
export class QueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueFullError";
  }
}

/** Errors from invalid Sandbox FileSystem operations. */
export class SandboxFilesystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxFilesystemError";
  }
}

/** Sandbox operations that exceed the allowed time limit. */
export class SandboxTimeoutError extends Error {
  constructor(message: string = "Sandbox operation timed out") {
    super(message);
    this.name = "SandboxTimeoutError";
  }
}
</file>

<file path="modal-js/src/function_call.ts">
// Manage existing Function Calls (look-ups, polling for output, cancellation).

import { client } from "./client";
import { ControlPlaneInvocation } from "./invocation";

/** Options for `FunctionCall.get()`. */
export type FunctionCallGetOptions = {
  timeout?: number; // in milliseconds
};

/** Options for `FunctionCall.cancel()`. */
export type FunctionCallCancelOptions = {
  terminateContainers?: boolean;
};

/**
 * Represents a Modal FunctionCall. Function Calls are Function invocations with
 * a given input. They can be consumed asynchronously (see `get()`) or cancelled
 * (see `cancel()`).
 */
export class FunctionCall {
  readonly functionCallId: string;

  /** @ignore */
  constructor(functionCallId: string) {
    this.functionCallId = functionCallId;
  }

  /** Create a new function call from ID. */
  fromId(functionCallId: string): FunctionCall {
    return new FunctionCall(functionCallId);
  }

  /** Get the result of a function call, optionally waiting with a timeout. */
  async get(options: FunctionCallGetOptions = {}): Promise<any> {
    const timeout = options.timeout;
    const invocation = ControlPlaneInvocation.fromFunctionCallId(
      this.functionCallId,
    );
    return invocation.awaitOutput(timeout);
  }

  /** Cancel a running function call. */
  async cancel(options: FunctionCallCancelOptions = {}) {
    await client.functionCallCancel({
      functionCallId: this.functionCallId,
      terminateContainers: options.terminateContainers,
    });
  }
}
</file>

<file path="modal-js/src/function.ts">
// Function calls and invocations, to be used with Modal Functions.

import { createHash } from "node:crypto";

import {
  DataFormat,
  FunctionCallInvocationType,
  FunctionInput,
} from "../proto/modal_proto/api";
import type { LookupOptions } from "./app";
import { client } from "./client";
import { FunctionCall } from "./function_call";
import { environmentName } from "./config";
import { InternalFailure, NotFoundError } from "./errors";
import { dumps } from "./pickle";
import { ClientError, Status } from "nice-grpc";
import {
  ControlPlaneInvocation,
  InputPlaneInvocation,
  Invocation,
} from "./invocation";

// From: modal/_utils/blob_utils.py
const maxObjectSizeBytes = 2 * 1024 * 1024; // 2 MiB

// From: client/modal/_functions.py
const maxSystemRetries = 8;

/** Represents a deployed Modal Function, which can be invoked remotely. */
export class Function_ {
  readonly functionId: string;
  readonly methodName?: string;
  #inputPlaneUrl?: string;

  /** @ignore */
  constructor(functionId: string, methodName?: string, inputPlaneUrl?: string) {
    this.functionId = functionId;
    this.methodName = methodName;
    this.#inputPlaneUrl = inputPlaneUrl;
  }

  static async lookup(
    appName: string,
    name: string,
    options: LookupOptions = {},
  ): Promise<Function_> {
    try {
      const resp = await client.functionGet({
        appName,
        objectTag: name,
        environmentName: environmentName(options.environment),
      });
      return new Function_(
        resp.functionId,
        undefined,
        resp.handleMetadata?.inputPlaneUrl,
      );
    } catch (err) {
      if (err instanceof ClientError && err.code === Status.NOT_FOUND)
        throw new NotFoundError(`Function '${appName}/${name}' not found`);
      throw err;
    }
  }

  // Execute a single input into a remote Function.
  async remote(
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<any> {
    const input = await this.#createInput(args, kwargs);
    const invocation = await this.#createRemoteInvocation(input);
    // TODO(ryan): Add tests for retries.
    let retryCount = 0;
    while (true) {
      try {
        return await invocation.awaitOutput();
      } catch (err) {
        if (err instanceof InternalFailure && retryCount <= maxSystemRetries) {
          await invocation.retry(retryCount);
          retryCount++;
        } else {
          throw err;
        }
      }
    }
  }

  async #createRemoteInvocation(input: FunctionInput): Promise<Invocation> {
    if (this.#inputPlaneUrl) {
      return await InputPlaneInvocation.create(
        this.#inputPlaneUrl,
        this.functionId,
        input,
      );
    }

    return await ControlPlaneInvocation.create(
      this.functionId,
      input,
      FunctionCallInvocationType.FUNCTION_CALL_INVOCATION_TYPE_SYNC,
    );
  }

  // Spawn a single input into a remote function.
  async spawn(
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<FunctionCall> {
    const input = await this.#createInput(args, kwargs);
    const invocation = await ControlPlaneInvocation.create(
      this.functionId,
      input,
      FunctionCallInvocationType.FUNCTION_CALL_INVOCATION_TYPE_ASYNC,
    );
    return new FunctionCall(invocation.functionCallId);
  }

  async #createInput(
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<FunctionInput> {
    const payload = dumps([args, kwargs]);

    let argsBlobId: string | undefined = undefined;
    if (payload.length > maxObjectSizeBytes) {
      argsBlobId = await blobUpload(payload);
    }

    // Single input sync invocation
    return {
      args: argsBlobId ? undefined : payload,
      argsBlobId,
      dataFormat: DataFormat.DATA_FORMAT_PICKLE,
      methodName: this.methodName,
      finalInput: false, // This field isn't specified in the Python client, so it defaults to false.
    };
  }
}

async function blobUpload(data: Uint8Array): Promise<string> {
  const contentMd5 = createHash("md5").update(data).digest("base64");
  const contentSha256 = createHash("sha256").update(data).digest("base64");
  const resp = await client.blobCreate({
    contentMd5,
    contentSha256Base64: contentSha256,
    contentLength: data.length,
  });
  if (resp.multipart) {
    throw new Error(
      "Function input size exceeds multipart upload threshold, unsupported by this SDK version",
    );
  } else if (resp.uploadUrl) {
    const uploadResp = await fetch(resp.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-MD5": contentMd5,
      },
      body: data,
    });
    if (uploadResp.status < 200 || uploadResp.status >= 300) {
      throw new Error(`Failed blob upload: ${uploadResp.statusText}`);
    }
    // Skip client-side ETag header validation for now (MD5 checksum).
    return resp.blobId;
  } else {
    throw new Error("Missing upload URL in BlobCreate response");
  }
}
</file>

<file path="modal-js/src/image.ts">
import {
  GenericResult,
  GenericResult_GenericStatus,
  ImageMetadata,
  ImageRegistryConfig,
} from "../proto/modal_proto/api";
import { client } from "./client";
import { imageBuilderVersion } from "./config";

/** A container image, used for starting sandboxes. */
export class Image {
  readonly imageId: string;

  /** @ignore */
  constructor(imageId: string) {
    this.imageId = imageId;
  }
}

export async function fromRegistryInternal(
  appId: string,
  tag: string,
  imageRegistryConfig?: ImageRegistryConfig,
): Promise<Image> {
  const resp = await client.imageGetOrCreate({
    appId,
    image: {
      dockerfileCommands: [`FROM ${tag}`],
      imageRegistryConfig,
    },
    builderVersion: imageBuilderVersion(),
  });

  let result: GenericResult;
  let metadata: ImageMetadata | undefined = undefined;

  if (resp.result?.status) {
    // Image has already been built
    result = resp.result;
    metadata = resp.metadata;
  } else {
    // Not built or in the process of building - wait for build
    let lastEntryId = "";
    let resultJoined: GenericResult | undefined = undefined;
    while (!resultJoined) {
      for await (const item of client.imageJoinStreaming({
        imageId: resp.imageId,
        timeout: 55,
        lastEntryId,
      })) {
        if (item.entryId) lastEntryId = item.entryId;
        if (item.result?.status) {
          resultJoined = item.result;
          metadata = item.metadata;
          break;
        }
        // Ignore all log lines and progress updates.
      }
    }
    result = resultJoined;
  }

  void metadata; // Note: Currently unused.

  if (result.status === GenericResult_GenericStatus.GENERIC_STATUS_FAILURE) {
    throw new Error(
      `Image build for ${resp.imageId} failed with the exception:\n${result.exception}`,
    );
  } else if (
    result.status === GenericResult_GenericStatus.GENERIC_STATUS_TERMINATED
  ) {
    throw new Error(
      `Image build for ${resp.imageId} terminated due to external shut-down. Please try again.`,
    );
  } else if (
    result.status === GenericResult_GenericStatus.GENERIC_STATUS_TIMEOUT
  ) {
    throw new Error(
      `Image build for ${resp.imageId} timed out. Please try again with a larger timeout parameter.`,
    );
  } else if (
    result.status !== GenericResult_GenericStatus.GENERIC_STATUS_SUCCESS
  ) {
    throw new Error(
      `Image build for ${resp.imageId} failed with unknown status: ${result.status}`,
    );
  }
  return new Image(resp.imageId);
}
</file>

<file path="modal-js/src/index.ts">
export {
  App,
  type DeleteOptions,
  type EphemeralOptions,
  type LookupOptions,
  type SandboxCreateOptions,
} from "./app";
export { type ClientOptions, initializeClient } from "./client";
export { Cls, ClsInstance } from "./cls";
export {
  FunctionTimeoutError,
  RemoteError,
  InternalFailure,
  NotFoundError,
  InvalidError,
  QueueEmptyError,
  QueueFullError,
  SandboxTimeoutError,
} from "./errors";
export { Function_ } from "./function";
export {
  FunctionCall,
  type FunctionCallGetOptions,
  type FunctionCallCancelOptions,
} from "./function_call";
export {
  Queue,
  type QueueClearOptions,
  type QueueGetOptions,
  type QueueIterateOptions,
  type QueueLenOptions,
  type QueuePutOptions,
} from "./queue";
export { Image } from "./image";
export type { ExecOptions, StdioBehavior, StreamMode, Tunnel } from "./sandbox";
export { ContainerProcess, Sandbox } from "./sandbox";
export type { ModalReadStream, ModalWriteStream } from "./streams";
export { Secret, type SecretFromNameOptions } from "./secret";
export { SandboxFile, type SandboxFileMode } from "./sandbox_filesystem";
export { Volume, type VolumeFromNameOptions } from "./volume";
</file>

<file path="modal-js/src/invocation.ts">
import {
  DataFormat,
  FunctionCallInvocationType,
  FunctionCallType,
  FunctionGetOutputsItem,
  FunctionInput,
  FunctionPutInputsItem,
  FunctionRetryInputsItem,
  GeneratorDone,
  GenericResult,
  GenericResult_GenericStatus,
  ModalClientClient,
} from "../proto/modal_proto/api";
import { client, getOrCreateInputPlaneClient } from "./client";
import { FunctionTimeoutError, InternalFailure, RemoteError } from "./errors";
import { loads } from "./pickle";

// From: modal-client/modal/_utils/function_utils.py
const outputsTimeout = 55 * 1000;

/**
 * This abstraction exists so that we can easily send inputs to either the control plane or the input plane.
 * For the control plane, we call the FunctionMap, FunctionRetryInputs, and FunctionGetOutputs RPCs.
 * For the input plane, we call the AttemptStart, AttemptRetry, and AttemptAwait RPCs.
 * For now, we support just the control plane, and will add support for the input plane soon.
 */
export interface Invocation {
  awaitOutput(timeout?: number): Promise<any>;
  retry(retryCount: number): Promise<void>;
}

/**
 * Implementation of Invocation which sends inputs to the control plane.
 */
export class ControlPlaneInvocation implements Invocation {
  readonly functionCallId: string;
  private readonly input?: FunctionInput;
  private readonly functionCallJwt?: string;
  private inputJwt?: string;

  private constructor(
    functionCallId: string,
    input?: FunctionInput,
    functionCallJwt?: string,
    inputJwt?: string,
  ) {
    this.functionCallId = functionCallId;
    this.input = input;
    this.functionCallJwt = functionCallJwt;
    this.inputJwt = inputJwt;
  }

  static async create(
    functionId: string,
    input: FunctionInput,
    invocationType: FunctionCallInvocationType,
  ) {
    const functionPutInputsItem = {
      idx: 0,
      input,
    };

    const functionMapResponse = await client.functionMap({
      functionId,
      functionCallType: FunctionCallType.FUNCTION_CALL_TYPE_UNARY,
      functionCallInvocationType: invocationType,
      pipelinedInputs: [functionPutInputsItem],
    });

    return new ControlPlaneInvocation(
      functionMapResponse.functionCallId,
      input,
      functionMapResponse.functionCallJwt,
      functionMapResponse.pipelinedInputs[0].inputJwt,
    );
  }

  static fromFunctionCallId(functionCallId: string) {
    return new ControlPlaneInvocation(functionCallId);
  }

  async awaitOutput(timeout?: number): Promise<any> {
    return await pollFunctionOutput(
      (timeoutMillis: number) => this.#getOutput(timeoutMillis),
      timeout,
    );
  }

  async #getOutput(
    timeoutMillis: number,
  ): Promise<FunctionGetOutputsItem | undefined> {
    const response = await client.functionGetOutputs({
      functionCallId: this.functionCallId,
      maxValues: 1,
      timeout: timeoutMillis / 1000, // Backend needs seconds
      lastEntryId: "0-0",
      clearOnSuccess: true,
      requestedAt: timeNowSeconds(),
    });
    return response.outputs ? response.outputs[0] : undefined;
  }

  async retry(retryCount: number): Promise<void> {
    // we do not expect this to happen
    if (!this.input) {
      throw new Error("Cannot retry function invocation - input missing");
    }

    const retryItem: FunctionRetryInputsItem = {
      inputJwt: this.inputJwt!,
      input: this.input,
      retryCount,
    };

    const functionRetryResponse = await client.functionRetryInputs({
      functionCallJwt: this.functionCallJwt,
      inputs: [retryItem],
    });
    this.inputJwt = functionRetryResponse.inputJwts[0];
  }
}

/**
 * Implementation of Invocation which sends inputs to the input plane.
 */
export class InputPlaneInvocation implements Invocation {
  private readonly client: ModalClientClient;
  private readonly functionId: string;
  private readonly input: FunctionPutInputsItem;
  private attemptToken: string;

  constructor(
    client: ModalClientClient,
    functionId: string,
    input: FunctionPutInputsItem,
    attemptToken: string,
  ) {
    this.client = client;
    this.functionId = functionId;
    this.input = input;
    this.attemptToken = attemptToken;
  }

  static async create(
    inputPlaneUrl: string,
    functionId: string,
    input: FunctionInput,
  ) {
    const functionPutInputsItem = {
      idx: 0,
      input,
      r2Failed: false,
      r2LatencyMs: 0,
    };
    const client = getOrCreateInputPlaneClient(inputPlaneUrl);
    // Single input sync invocation
    const attemptStartResponse = await client.attemptStart({
      functionId,
      input: functionPutInputsItem,
    });
    return new InputPlaneInvocation(
      client,
      functionId,
      functionPutInputsItem,
      attemptStartResponse.attemptToken,
    );
  }

  async awaitOutput(timeout?: number): Promise<any> {
    return await pollFunctionOutput(
      (timeoutMillis: number) => this.#getOutput(timeoutMillis),
      timeout,
    );
  }

  async #getOutput(
    timeoutMillis: number,
  ): Promise<FunctionGetOutputsItem | undefined> {
    const response = await this.client.attemptAwait({
      attemptToken: this.attemptToken,
      requestedAt: timeNowSeconds(),
      timeoutSecs: timeoutMillis / 1000,
    });
    return response.output;
  }

  async retry(_retryCount: number): Promise<void> {
    const attemptRetryResponse = await this.client.attemptRetry({
      functionId: this.functionId,
      input: this.input,
      attemptToken: this.attemptToken,
    });
    this.attemptToken = attemptRetryResponse.attemptToken;
  }
}

function timeNowSeconds() {
  return Date.now() / 1e3;
}

/**
 * Signature of a function that fetches a single output using the given timeout. Used by `pollForOutputs` to fetch
 * from either the control plane or the input plane, depending on the implementation.
 */
type GetOutput = (
  timeoutMillis: number,
) => Promise<FunctionGetOutputsItem | undefined>;

/***
 * Repeatedly tries to fetch an output using the provided `getOutput` function, and the specified timeout value.
 * We use a timeout value of 55 seconds if the caller does not specify a timeout value, or if the specified timeout
 * value is greater than 55 seconds.
 */
async function pollFunctionOutput(
  getOutput: GetOutput,
  timeout?: number, // in milliseconds
): Promise<any> {
  const startTime = Date.now();
  let pollTimeout = outputsTimeout;
  if (timeout !== undefined) {
    pollTimeout = Math.min(timeout, outputsTimeout);
  }

  while (true) {
    const output = await getOutput(pollTimeout);
    if (output) {
      return await processResult(output.result, output.dataFormat);
    }

    if (timeout !== undefined) {
      const remainingTime = timeout - (Date.now() - startTime);
      if (remainingTime <= 0) {
        const message = `Timeout exceeded: ${(timeout / 1000).toFixed(1)}s`;
        throw new FunctionTimeoutError(message);
      }
      pollTimeout = Math.min(outputsTimeout, remainingTime);
    }
  }
}

async function processResult(
  result: GenericResult | undefined,
  dataFormat: DataFormat,
): Promise<unknown> {
  if (!result) {
    throw new Error("Received null result from invocation");
  }

  let data = new Uint8Array();
  if (result.data !== undefined) {
    data = result.data;
  } else if (result.dataBlobId) {
    data = await blobDownload(result.dataBlobId);
  }

  switch (result.status) {
    case GenericResult_GenericStatus.GENERIC_STATUS_TIMEOUT:
      throw new FunctionTimeoutError(`Timeout: ${result.exception}`);
    case GenericResult_GenericStatus.GENERIC_STATUS_INTERNAL_FAILURE:
      throw new InternalFailure(`Internal failure: ${result.exception}`);
    case GenericResult_GenericStatus.GENERIC_STATUS_SUCCESS:
      // Proceed to deserialize the data.
      break;
    default:
      // Handle other statuses, e.g., remote error.
      throw new RemoteError(`Remote error: ${result.exception}`);
  }

  return deserializeDataFormat(data, dataFormat);
}

async function blobDownload(blobId: string): Promise<Uint8Array> {
  const resp = await client.blobGet({ blobId });
  const s3resp = await fetch(resp.downloadUrl);
  if (!s3resp.ok) {
    throw new Error(`Failed to download blob: ${s3resp.statusText}`);
  }
  const buf = await s3resp.arrayBuffer();
  return new Uint8Array(buf);
}

function deserializeDataFormat(
  data: Uint8Array | undefined,
  dataFormat: DataFormat,
): unknown {
  if (!data) {
    return null; // No data to deserialize.
  }

  switch (dataFormat) {
    case DataFormat.DATA_FORMAT_PICKLE:
      return loads(data);
    case DataFormat.DATA_FORMAT_ASGI:
      throw new Error("ASGI data format is not supported in Go");
    case DataFormat.DATA_FORMAT_GENERATOR_DONE:
      return GeneratorDone.decode(data);
    default:
      throw new Error(`Unsupported data format: ${dataFormat}`);
  }
}
</file>

<file path="modal-js/src/pickle.test.ts">
import { describe, expect, test } from "vitest";
import { dumps, loads, type Protocol } from "./pickle";
import { Buffer } from "node:buffer";

test("PickleUnpickle", () => {
  const sample = {
    a: 1,
    b: [2, 3, true, null],
    c: new Uint8Array([4, 5, 6]),
    d: "hello 🎉",
  };
  for (const proto of [3, 4, 5] as Protocol[]) {
    const pkl = dumps(sample, proto);
    const back = loads(pkl);
    expect(back).toEqual(sample);
  }
});

// Python pickle compatibility tests (v4)
// Using `python -c "import pickle, base64; print(base64.b64encode(pickle.dumps(..., protocol=4)).decode())"`
const testCases = [
  {
    name: "MinusOne",
    b64: "gASVBgAAAAAAAABK/////y4=",
    expected: -1,
  },
  {
    // [b'1', b'2', b'3']
    name: "BytesList - uses MARK and APPENDS",
    b64: "gASVEQAAAAAAAABdlChDATGUQwEylEMBM5RlLg==",
    expected: [
      new Uint8Array([49]),
      new Uint8Array([50]),
      new Uint8Array([51]),
    ],
  },
  {
    name: "SimpleList",
    b64: "gASVCwAAAAAAAABdlChLAUsCSwNlLg==",
    expected: [1, 2, 3],
  },
  {
    name: "SimpleDict",
    b64: "gASVEQAAAAAAAAB9lCiMAWGUSwGMAWKUSwJ1Lg==",
    expected: { a: 1, b: 2 },
  },
  // Integer edge cases
  { name: "BININT1_0", b64: "gARLAC4=", expected: 0 },
  { name: "BININT1_255", b64: "gARL/y4=", expected: 255 },
  { name: "BININT2_-32768", b64: "gASVBgAAAAAAAABKAID//y4=", expected: -32768 },
  { name: "BININT2_32767", b64: "gASVBAAAAAAAAABN/38u", expected: 32767 },
  {
    name: "BININT4_-2147483648",
    b64: "gASVBgAAAAAAAABKAAAAgC4=",
    expected: -2147483648,
  },
  {
    name: "BININT4_2147483647",
    b64: "gASVBgAAAAAAAABK////fy4=",
    expected: 2147483647,
  },
];

describe("Python compatibility", () => {
  for (const { name, b64, expected } of testCases) {
    test(name, () => {
      const buf = Buffer.from(b64, "base64");
      const val = loads(new Uint8Array(buf));
      expect(val).toEqual(expected);
      expect(loads(dumps(val, 4))).toEqual(val);
    });
  }
});
</file>

<file path="modal-js/src/pickle.ts">
// Minimal pickle codec in TypeScript supporting protocol 3, 4 and 5
// ============================================================
// Focus: JSON‑compatible primitives (null, bool, number, string, arrays, plain
//         objects) plus Uint8Array.  The encoder can *emit* protocol 3, 4 or 5
// (default 4).  The decoder can *read* any pickle whose first PROTO opcode is
// 3, 4 or 5 **provided it only uses the opcodes below**.  This is *not* a full
// Python pickler, but is more than good enough for lightweight data exchange.
// -------------------------------------------------------------
// Implemented opcodes
//   Generic:  PROTO, STOP, NONE, NEWTRUE, NEWFALSE
//   Numbers:  BININT1, BININT2, BININT4 (aka BININT), BINFLOAT
//   Text:     SHORT_BINUNICODE, BINUNICODE, BINUNICODE8
//   Bytes:    SHORT_BINBYTES,  BINBYTES,  BINBYTES8
//   Containers: EMPTY_LIST, APPEND, EMPTY_DICT, SETITEM, MARK, SETITEMS, APPENDS
//   Memo:     MEMOIZE   (≥4), BINPUT/LONG_BINPUT + BINGET/LONG_BINGET (≤3)
//   Frames:   FRAME (proto‑5) – we just skip the announced length.
// -------------------------------------------------------------

class PickleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PickleError";
  }
}

// ─── Opcode values (single‑byte) ─────────────────────────────
const enum Op {
  PROTO = 0x80, // PROTO n
  STOP = 0x2e, // .
  NONE = 0x4e, // N
  NEWTRUE = 0x88, // \x88
  NEWFALSE = 0x89, // \x89

  BININT1 = 0x4b, // K  (uint8)
  BININT2 = 0x4d, // M  (uint16 LE)
  BININT4 = 0x4a, // J  (int32 LE)
  BINFLOAT = 0x47, // G  (float64 BE)

  SHORT_BINUNICODE = 0x8c, // \x8c len(1) data
  BINUNICODE = 0x58, // X len(4) data
  BINUNICODE8 = 0x8d, // \x8d len(8) data (≥4)

  SHORT_BINBYTES = 0x43, // C len(1) data (≥3)
  BINBYTES = 0x42, // B len(4) data (≥3)
  BINBYTES8 = 0x8e, // \x8e len(8) data (≥4)

  EMPTY_LIST = 0x5d, // ]
  APPEND = 0x61, // a
  EMPTY_DICT = 0x7d, // }
  SETITEM = 0x73, // s
  MARK = 0x28, // (  (mark stack position)

  // Memo / frame machinery
  BINPUT = 0x71, // q  idx(1)
  LONG_BINPUT = 0x72, // r  idx(4)
  BINGET = 0x68, // h  idx(1)
  LONG_BINGET = 0x6a, // j  idx(4)
  MEMOIZE = 0x94, // \x94 (≥4)
  FRAME = 0x95, // \x95 size(8) (proto‑5)
  APPENDS = 0x65, // e
  SETITEMS = 0x75, // u
}

// ─── Binary helpers ─────────────────────────────────────────
class Writer {
  private out: number[] = [];
  byte(b: number) {
    this.out.push(b & 0xff);
  }
  bytes(arr: Uint8Array | number[]) {
    for (const b of arr) this.byte(b as number);
  }
  uint32LE(x: number) {
    this.byte(x);
    this.byte(x >>> 8);
    this.byte(x >>> 16);
    this.byte(x >>> 24);
  }
  uint64LE(n: number | bigint) {
    let v = BigInt(n);
    for (let i = 0; i < 8; i++) {
      this.byte(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  float64BE(v: number) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, v, false);
    this.bytes(new Uint8Array(dv.buffer));
  }
  toUint8(): Uint8Array {
    return new Uint8Array(this.out);
  }
}

class Reader {
  constructor(
    private buf: Uint8Array,
    private pos = 0,
  ) {}
  eof() {
    return this.pos >= this.buf.length;
  }
  byte() {
    return this.buf[this.pos++];
  }
  take(n: number) {
    const s = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  uint32LE() {
    const b0 = this.byte(),
      b1 = this.byte(),
      b2 = this.byte(),
      b3 = this.byte();
    return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
  }
  uint64LE() {
    const lo = this.uint32LE() >>> 0;
    const hi = this.uint32LE() >>> 0;
    return hi * 2 ** 32 + lo;
  }
  int32LE() {
    const v = new DataView(
      this.buf.buffer,
      this.buf.byteOffset + this.pos,
      4,
    ).getInt32(0, true);
    this.pos += 4;
    return v;
  }
  float64BE() {
    const v = new DataView(
      this.buf.buffer,
      this.buf.byteOffset + this.pos,
      8,
    ).getFloat64(0, false);
    this.pos += 8;
    return v;
  }
}

// ─── Encoder ────────────────────────────────────────────────
export type Protocol = 3 | 4 | 5;

function encodeValue(val: any, w: Writer, proto: Protocol) {
  // null / bool ------------------------------------------------
  if (val === null || val === undefined) {
    w.byte(Op.NONE);
    return;
  }
  if (typeof val === "boolean") {
    w.byte(val ? Op.NEWTRUE : Op.NEWFALSE);
    return;
  }

  // number -----------------------------------------------------
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      if (val >= 0 && val <= 0xff) {
        w.byte(Op.BININT1);
        w.byte(val);
      } else if (val >= -0x8000 && val <= 0x7fff) {
        w.byte(Op.BININT2);
        w.byte(val & 0xff);
        w.byte((val >> 8) & 0xff);
      } else {
        w.byte(Op.BININT4);
        w.uint32LE(val >>> 0);
      }
    } else {
      w.byte(Op.BINFLOAT);
      w.float64BE(val);
    }
    maybeMemoize(w, proto);
    return;
  }

  // string -----------------------------------------------------
  if (typeof val === "string") {
    const utf8 = new TextEncoder().encode(val);
    if (proto >= 4 && utf8.length < 256) {
      w.byte(Op.SHORT_BINUNICODE);
      w.byte(utf8.length);
    } else if (proto >= 4 && utf8.length > 0xffff_ffff) {
      w.byte(Op.BINUNICODE8);
      w.uint64LE(utf8.length);
    } else {
      w.byte(Op.BINUNICODE);
      w.uint32LE(utf8.length);
    }
    w.bytes(utf8);
    maybeMemoize(w, proto);
    return;
  }

  // bytes / Uint8Array ----------------------------------------
  if (val instanceof Uint8Array) {
    const len = val.length;
    if (proto >= 4 && len < 256) {
      w.byte(Op.SHORT_BINBYTES);
      w.byte(len);
    } else if (proto >= 4 && len > 0xffff_ffff) {
      w.byte(Op.BINBYTES8);
      w.uint64LE(len);
    } else {
      w.byte(Op.BINBYTES);
      w.uint32LE(len);
    }
    w.bytes(val);
    maybeMemoize(w, proto);
    return;
  }

  // Array ------------------------------------------------------
  if (Array.isArray(val)) {
    w.byte(Op.EMPTY_LIST);
    maybeMemoize(w, proto);
    for (const item of val) {
      encodeValue(item, w, proto);
      w.byte(Op.APPEND);
    }
    return;
  }

  // plain object ----------------------------------------------
  if (typeof val === "object") {
    w.byte(Op.EMPTY_DICT);
    maybeMemoize(w, proto);
    for (const [k, v] of Object.entries(val)) {
      encodeValue(k, w, proto);
      encodeValue(v, w, proto);
      w.byte(Op.SETITEM);
    }
    return;
  }

  throw new PickleError(`Unsupported type in dumps(): ${typeof val}`);
}

function maybeMemoize(w: Writer, proto: Protocol) {
  if (proto >= 4) {
    w.byte(Op.MEMOIZE);
  } // super-simple strategy: memo every value >=4
}

export function dumps(obj: any, protocol: Protocol = 4): Uint8Array {
  if (![3, 4, 5].includes(protocol))
    throw new PickleError("Protocol must be 3, 4, or 5");
  const w = new Writer();
  w.byte(Op.PROTO);
  w.byte(protocol);
  if (protocol === 5) {
    // Emit a minimal zero‑length FRAME so CPython recognises proto‑5 content.
    w.byte(Op.FRAME);
    w.uint64LE(0);
  }
  encodeValue(obj, w, protocol);
  w.byte(Op.STOP);
  return w.toUint8();
}

// ─── Decoder ────────────────────────────────────────────────
export function loads(buf: Uint8Array): any {
  const r = new Reader(buf);
  const op0 = r.byte();
  if (op0 !== Op.PROTO) throw new PickleError("pickle missing PROTO header");
  const proto: Protocol = r.byte() as Protocol;
  if (!(proto === 3 || proto === 4 || proto === 5))
    throw new PickleError(`Unsupported protocol ${proto}`);

  const stack: any[] = [];
  const memo: any[] = [];
  const tdec = new TextDecoder();

  function push(v: any) {
    stack.push(v);
  }
  function pop() {
    return stack.pop();
  }

  // If proto‑5 and next opcode is FRAME, consume size then continue.
  if (proto === 5 && buf[r["pos"]] === Op.FRAME) {
    r.byte(); // FRAME
    const size = r.uint64LE(); // we ignore the size and just stream‑read.
    void size; // silence tsclint
  }

  // Unique marker for stack operations (cannot be confused with user data)
  const MARK = Symbol("pickle-mark");

  while (!r.eof()) {
    const op = r.byte();
    switch (op) {
      case Op.STOP:
        return stack.pop();
      case Op.NONE:
        push(null);
        break;
      case Op.NEWTRUE:
        push(true);
        break;
      case Op.NEWFALSE:
        push(false);
        break;

      case Op.BININT1:
        push(r.byte());
        break;
      case Op.BININT2: {
        const lo = r.byte(),
          hi = r.byte();
        const n = (hi << 8) | lo;
        push(n & 0x8000 ? n - 0x10000 : n);
        break;
      }
      case Op.BININT4: {
        push(r.int32LE());
        break;
      }
      case Op.BINFLOAT:
        push(r.float64BE());
        break;

      case Op.SHORT_BINUNICODE: {
        const n = r.byte();
        push(tdec.decode(r.take(n)));
        break;
      }
      case Op.BINUNICODE: {
        const n = r.uint32LE();
        push(tdec.decode(r.take(n)));
        break;
      }
      case Op.BINUNICODE8: {
        const n = r.uint64LE();
        push(tdec.decode(r.take(n)));
        break;
      }

      case Op.SHORT_BINBYTES: {
        const n = r.byte();
        push(r.take(n));
        break;
      }
      case Op.BINBYTES: {
        const n = r.uint32LE();
        push(r.take(n));
        break;
      }
      case Op.BINBYTES8: {
        const n = r.uint64LE();
        push(r.take(n));
        break;
      }

      case Op.EMPTY_LIST:
        push([]);
        break;
      case Op.APPEND: {
        const v = pop();
        const lst = pop();
        lst.push(v);
        push(lst);
        break;
      }
      case Op.EMPTY_DICT:
        push({});
        break;
      case Op.SETITEM: {
        const v = pop(),
          k = pop(),
          d = pop();
        d[k] = v;
        push(d);
        break;
      }

      // Memo handling ----------------------------------------
      case Op.MEMOIZE:
        memo.push(stack[stack.length - 1]);
        break;
      case Op.BINPUT:
        memo[r.byte()] = stack[stack.length - 1];
        break;
      case Op.LONG_BINPUT:
        memo[r.uint32LE()] = stack[stack.length - 1];
        break;
      case Op.BINGET:
        push(memo[r.byte()]);
        break;
      case Op.LONG_BINGET:
        push(memo[r.uint32LE()]);
        break;

      case Op.FRAME: {
        const _size = r.uint64LE();
        /* ignore */ break;
      }

      case Op.MARK:
        push(MARK);
        break;

      case Op.APPENDS: {
        // Pops all items after the last MARK and appends them to the list below the MARK
        // Find the last MARK
        const markIndex = stack.lastIndexOf(MARK);
        if (markIndex === -1) {
          throw new PickleError("APPENDS without MARK");
        }
        const lst = stack[markIndex - 1];
        if (!Array.isArray(lst)) {
          throw new PickleError("APPENDS expects a list below MARK");
        }
        const items = stack.slice(markIndex + 1);
        lst.push(...items);
        stack.length = markIndex - 1; // Remove everything after the list
        push(lst);
        break;
      }

      case Op.SETITEMS: {
        // Sets multiple key-value pairs in a dict after the last MARK
        // Find the last MARK
        const markIndex = stack.lastIndexOf(MARK);
        if (markIndex === -1) {
          throw new PickleError("SETITEMS without MARK");
        }
        const d = stack[markIndex - 1];
        if (typeof d !== "object" || d === null || Array.isArray(d)) {
          throw new PickleError("SETITEMS expects a dict below MARK");
        }
        const items = stack.slice(markIndex + 1);
        // Set key-value pairs (items come in pairs: key, value, key, value, ...)
        for (let i = 0; i < items.length; i += 2) {
          if (i + 1 < items.length) {
            d[items[i]] = items[i + 1];
          }
        }
        stack.length = markIndex - 1; // Remove everything after the dict
        push(d);
        break;
      }

      default:
        throw new PickleError(`Unsupported opcode 0x${op.toString(16)}`);
    }
  }
  throw new PickleError("pickle stream ended without STOP");
}
</file>

<file path="modal-js/src/queue.ts">
// Queue object, to be used with Modal Queues.

import {
  ObjectCreationType,
  QueueNextItemsRequest,
} from "../proto/modal_proto/api";
import type { DeleteOptions, EphemeralOptions, LookupOptions } from "./app";
import { client } from "./client";
import { environmentName } from "./config";
import { InvalidError, QueueEmptyError, QueueFullError } from "./errors";
import { dumps, loads } from "./pickle";
import { ClientError, Status } from "nice-grpc";

// From: modal/_object.py
const ephemeralObjectHeartbeatSleep = 300_000; // 300 seconds

const queueInitialPutBackoff = 100; // 100 milliseconds
const queueDefaultPartitionTtl = 24 * 3600 * 1000; // 24 hours

/** Options to configure a `Queue.clear()` operation. */
export type QueueClearOptions = {
  /** Partition to clear, uses default partition if not set. */
  partition?: string;

  /** Set to clear all queue partitions. */
  all?: boolean;
};

/** Options to configure a `Queue.get()` or `Queue.getMany()` operation. */
export type QueueGetOptions = {
  /** How long to wait if the queue is empty (default: indefinite). */
  timeout?: number;

  /** Partition to fetch values from, uses default partition if not set. */
  partition?: string;
};

/** Options to configure a `Queue.put()` or `Queue.putMany()` operation. */
export type QueuePutOptions = {
  /** How long to wait if the queue is full (default: indefinite). */
  timeout?: number;

  /** Partition to add items to, uses default partition if not set. */
  partition?: string;

  /** TTL for the partition in seconds (default: 1 day). */
  partitionTtl?: number;
};

/** Options to configure a `Queue.len()` operation. */
export type QueueLenOptions = {
  /** Partition to compute length, uses default partition if not set. */
  partition?: string;

  /** Return the total length across all partitions. */
  total?: boolean;
};

/** Options to configure a `Queue.iterate()` operation. */
export type QueueIterateOptions = {
  /** How long to wait between successive items before exiting iteration (default: 0). */
  itemPollTimeout?: number;

  /** Partition to iterate, uses default partition if not set. */
  partition?: string;
};

/**
 * Distributed, FIFO queue for data flow in Modal apps.
 */
export class Queue {
  readonly queueId: string;
  readonly #ephemeral: boolean;
  readonly #abortController?: AbortController;

  /** @ignore */
  constructor(queueId: string, ephemeral: boolean = false) {
    this.queueId = queueId;
    this.#ephemeral = ephemeral;
    this.#abortController = ephemeral ? new AbortController() : undefined;
  }

  static #validatePartitionKey(partition: string | undefined): Uint8Array {
    if (partition) {
      const partitionKey = new TextEncoder().encode(partition);
      if (partitionKey.length === 0 || partitionKey.length > 64) {
        throw new InvalidError(
          "Queue partition key must be between 1 and 64 bytes.",
        );
      }
      return partitionKey;
    }
    return new Uint8Array();
  }

  /**
   * Create a nameless, temporary queue.
   * You will need to call `closeEphemeral()` to delete the queue.
   */
  static async ephemeral(options: EphemeralOptions = {}): Promise<Queue> {
    const resp = await client.queueGetOrCreate({
      objectCreationType: ObjectCreationType.OBJECT_CREATION_TYPE_EPHEMERAL,
      environmentName: environmentName(options.environment),
    });

    const queue = new Queue(resp.queueId, true);
    const signal = queue.#abortController!.signal;
    (async () => {
      // Launch a background task to heartbeat the ephemeral queue.
      while (true) {
        await client.queueHeartbeat({ queueId: resp.queueId });
        await Promise.race([
          new Promise((resolve) =>
            setTimeout(resolve, ephemeralObjectHeartbeatSleep),
          ),
          new Promise((resolve) => {
            signal.addEventListener("abort", resolve, { once: true });
          }),
        ]);
      }
    })();

    return queue;
  }

  /** Delete the ephemeral queue. Only usable with `Queue.ephemeral()`. */
  closeEphemeral(): void {
    if (this.#ephemeral) {
      this.#abortController!.abort();
    } else {
      throw new InvalidError("Queue is not ephemeral.");
    }
  }

  /**
   * Lookup a queue by name.
   */
  static async lookup(
    name: string,
    options: LookupOptions = {},
  ): Promise<Queue> {
    const resp = await client.queueGetOrCreate({
      deploymentName: name,
      objectCreationType: options.createIfMissing
        ? ObjectCreationType.OBJECT_CREATION_TYPE_CREATE_IF_MISSING
        : undefined,
      environmentName: environmentName(options.environment),
    });
    return new Queue(resp.queueId);
  }

  /** Delete a queue by name. */
  static async delete(
    name: string,
    options: DeleteOptions = {},
  ): Promise<void> {
    const queue = await Queue.lookup(name, options);
    await client.queueDelete({ queueId: queue.queueId });
  }

  /**
   * Remove all objects from a queue partition.
   */
  async clear(options: QueueClearOptions = {}): Promise<void> {
    if (options.partition && options.all) {
      throw new InvalidError(
        "Partition must be null when requesting to clear all.",
      );
    }
    await client.queueClear({
      queueId: this.queueId,
      partitionKey: Queue.#validatePartitionKey(options.partition),
      allPartitions: options.all,
    });
  }

  async #get(n: number, partition?: string, timeout?: number): Promise<any[]> {
    const partitionKey = Queue.#validatePartitionKey(partition);

    const startTime = Date.now();
    let pollTimeout = 50_000;
    if (timeout !== undefined) {
      pollTimeout = Math.min(pollTimeout, timeout);
    }

    while (true) {
      const response = await client.queueGet({
        queueId: this.queueId,
        partitionKey,
        timeout: pollTimeout / 1000,
        nValues: n,
      });
      if (response.values && response.values.length > 0) {
        return response.values.map((value) => loads(value));
      }
      if (timeout !== undefined) {
        const remaining = timeout - (Date.now() - startTime);
        if (remaining <= 0) {
          const message = `Queue ${this.queueId} did not return values within ${timeout}ms.`;
          throw new QueueEmptyError(message);
        }
        pollTimeout = Math.min(pollTimeout, remaining);
      }
    }
  }

  /**
   * Remove and return the next object from the queue.
   *
   * By default, this will wait until at least one item is present in the queue.
   * If `timeout` is set, raises `QueueEmptyError` if no items are available
   * within that timeout in milliseconds.
   */
  async get(options: QueueGetOptions = {}): Promise<any | null> {
    const values = await this.#get(1, options.partition, options.timeout);
    return values[0]; // Must have length >= 1 if returned.
  }

  /**
   * Remove and return up to `n` objects from the queue.
   *
   * By default, this will wait until at least one item is present in the queue.
   * If `timeout` is set, raises `QueueEmptyError` if no items are available
   * within that timeout in milliseconds.
   */
  async getMany(n: number, options: QueueGetOptions = {}): Promise<any[]> {
    return await this.#get(n, options.partition, options.timeout);
  }

  async #put(
    values: any[],
    timeout?: number,
    partition?: string,
    partitionTtl?: number,
  ): Promise<void> {
    const valuesEncoded = values.map((v) => dumps(v));
    const partitionKey = Queue.#validatePartitionKey(partition);

    let delay = queueInitialPutBackoff;
    const deadline = timeout ? Date.now() + timeout : undefined;
    while (true) {
      try {
        await client.queuePut({
          queueId: this.queueId,
          values: valuesEncoded,
          partitionKey,
          partitionTtlSeconds:
            (partitionTtl || queueDefaultPartitionTtl) / 1000,
        });
        break;
      } catch (e) {
        if (e instanceof ClientError && e.code === Status.RESOURCE_EXHAUSTED) {
          // Queue is full, retry with exponential backoff up to the deadline.
          delay = Math.min(delay * 2, 30_000);
          if (deadline !== undefined) {
            const remaining = deadline - Date.now();
            if (remaining <= 0)
              throw new QueueFullError(`Put failed on ${this.queueId}.`);
            delay = Math.min(delay, remaining);
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw e;
        }
      }
    }
  }

  /**
   * Add an item to the end of the queue.
   *
   * If the queue is full, this will retry with exponential backoff until the
   * provided `timeout` is reached, or indefinitely if `timeout` is not set.
   * Raises `QueueFullError` if the queue is still full after the timeout.
   */
  async put(v: any, options: QueuePutOptions = {}): Promise<void> {
    await this.#put(
      [v],
      options.timeout,
      options.partition,
      options.partitionTtl,
    );
  }

  /**
   * Add several items to the end of the queue.
   *
   * If the queue is full, this will retry with exponential backoff until the
   * provided `timeout` is reached, or indefinitely if `timeout` is not set.
   * Raises `QueueFullError` if the queue is still full after the timeout.
   */
  async putMany(values: any[], options: QueuePutOptions = {}): Promise<void> {
    await this.#put(
      values,
      options.timeout,
      options.partition,
      options.partitionTtl,
    );
  }

  /** Return the number of objects in the queue. */
  async len(options: QueueLenOptions = {}): Promise<number> {
    if (options.partition && options.total) {
      throw new InvalidError(
        "Partition must be null when requesting total length.",
      );
    }
    const resp = await client.queueLen({
      queueId: this.queueId,
      partitionKey: Queue.#validatePartitionKey(options.partition),
      total: options.total,
    });
    return resp.len;
  }

  /** Iterate through items in a queue without mutation. */
  async *iterate(
    options: QueueIterateOptions = {},
  ): AsyncGenerator<any, void, unknown> {
    const { partition, itemPollTimeout = 0 } = options;

    let lastEntryId = undefined;
    const validatedPartitionKey = Queue.#validatePartitionKey(partition);
    let fetchDeadline = Date.now() + itemPollTimeout;

    const maxPollDuration = 30_000;
    while (true) {
      const pollDuration = Math.max(
        0.0,
        Math.min(maxPollDuration, fetchDeadline - Date.now()),
      );
      const request: QueueNextItemsRequest = {
        queueId: this.queueId,
        partitionKey: validatedPartitionKey,
        itemPollTimeout: pollDuration / 1000,
        lastEntryId: lastEntryId || "",
      };

      const response = await client.queueNextItems(request);
      if (response.items && response.items.length > 0) {
        for (const item of response.items) {
          yield loads(item.value);
          lastEntryId = item.entryId;
        }
        fetchDeadline = Date.now() + itemPollTimeout;
      } else if (Date.now() > fetchDeadline) {
        break;
      }
    }
  }
}
</file>

<file path="modal-js/src/sandbox_filesystem.ts">
import {
  ContainerFilesystemExecRequest,
  DeepPartial,
  ContainerFilesystemExecResponse,
} from "../proto/modal_proto/api";
import { client, isRetryableGrpc } from "./client";
import { SandboxFilesystemError } from "./errors";

/** File open modes supported by the filesystem API. */
export type SandboxFileMode = "r" | "w" | "a" | "r+" | "w+" | "a+";

/**
 * SandboxFile represents an open file in the sandbox filesystem.
 * Provides read/write operations similar to Node.js `fsPromises.FileHandle`.
 */
export class SandboxFile {
  readonly #fileDescriptor: string;
  readonly #taskId: string;

  /** @ignore */
  constructor(fileDescriptor: string, taskId: string) {
    this.#fileDescriptor = fileDescriptor;
    this.#taskId = taskId;
  }

  /**
   * Read data from the file.
   * @returns Promise that resolves to the read data as Uint8Array
   */
  async read(): Promise<Uint8Array> {
    const resp = await runFilesystemExec({
      fileReadRequest: {
        fileDescriptor: this.#fileDescriptor,
      },
      taskId: this.#taskId,
    });
    const chunks = resp.chunks;

    // Concatenate all chunks into a single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Write data to the file.
   * @param data - Data to write (string or Uint8Array)
   */
  async write(data: Uint8Array): Promise<void> {
    await runFilesystemExec({
      fileWriteRequest: {
        fileDescriptor: this.#fileDescriptor,
        data,
      },
      taskId: this.#taskId,
    });
  }

  /**
   * Flush any buffered data to the file.
   */
  async flush(): Promise<void> {
    await runFilesystemExec({
      fileFlushRequest: {
        fileDescriptor: this.#fileDescriptor,
      },
      taskId: this.#taskId,
    });
  }

  /**
   * Close the file handle.
   */
  async close(): Promise<void> {
    await runFilesystemExec({
      fileCloseRequest: {
        fileDescriptor: this.#fileDescriptor,
      },
      taskId: this.#taskId,
    });
  }
}

export async function runFilesystemExec(
  request: DeepPartial<ContainerFilesystemExecRequest>,
): Promise<{
  chunks: Uint8Array[];
  response: ContainerFilesystemExecResponse;
}> {
  const response = await client.containerFilesystemExec(request);

  const chunks: Uint8Array[] = [];
  let retries = 10;
  let completed = false;
  while (!completed) {
    try {
      const outputIterator = client.containerFilesystemExecGetOutput({
        execId: response.execId,
        timeout: 55,
      });
      for await (const batch of outputIterator) {
        chunks.push(...batch.output);
        if (batch.eof) {
          completed = true;
          break;
        }
        if (batch.error !== undefined) {
          if (retries > 0) {
            retries--;
            break;
          }
          throw new SandboxFilesystemError(batch.error.errorMessage);
        }
      }
    } catch (err) {
      if (isRetryableGrpc(err) && retries > 0) {
        retries--;
      } else throw err;
    }
  }
  return { chunks, response };
}
</file>

<file path="modal-js/src/sandbox.ts">
import {
  FileDescriptor,
  GenericResult_GenericStatus,
} from "../proto/modal_proto/api";
import { client, isRetryableGrpc } from "./client";
import {
  runFilesystemExec,
  SandboxFile,
  SandboxFileMode,
} from "./sandbox_filesystem";
import {
  type ModalReadStream,
  type ModalWriteStream,
  streamConsumingIter,
  toModalReadStream,
  toModalWriteStream,
} from "./streams";
import { InvalidError, SandboxTimeoutError } from "./errors";

/**
 * Stdin is always present, but this option allow you to drop stdout or stderr
 * if you don't need them. The default is "pipe", matching Node.js behavior.
 *
 * If behavior is set to "ignore", the output streams will be empty.
 */
export type StdioBehavior = "pipe" | "ignore";

/**
 * Specifies the type of data that will be read from the sandbox or container
 * process. "text" means the data will be read as UTF-8 text, while "binary"
 * means the data will be read as raw bytes (Uint8Array).
 */
export type StreamMode = "text" | "binary";

/** Options to configure a `Sandbox.exec()` operation. */
export type ExecOptions = {
  /** Specifies text or binary encoding for input and output streams. */
  mode?: StreamMode;
  /** Whether to pipe or ignore standard output. */
  stdout?: StdioBehavior;
  /** Whether to pipe or ignore standard error. */
  stderr?: StdioBehavior;
  /** Working directory to run the command in. */
  workdir?: string;
  /** Timeout for the process in milliseconds. Defaults to 0 (no timeout). */
  timeout?: number;
};

/** A port forwarded from within a running Modal sandbox. */
export class Tunnel {
  /** @ignore */
  constructor(
    public host: string,
    public port: number,
    public unencryptedHost?: string,
    public unencryptedPort?: number,
  ) {}

  /** Get the public HTTPS URL of the forwarded port. */
  get url(): string {
    let value = `https://${this.host}`;
    if (this.port !== 443) {
      value += `:${this.port}`;
    }
    return value;
  }

  /** Get the public TLS socket as a [host, port] tuple. */
  get tlsSocket(): [string, number] {
    return [this.host, this.port];
  }

  /** Get the public TCP socket as a [host, port] tuple. */
  get tcpSocket(): [string, number] {
    if (!this.unencryptedHost || this.unencryptedPort === undefined) {
      throw new InvalidError(
        "This tunnel is not configured for unencrypted TCP.",
      );
    }
    return [this.unencryptedHost, this.unencryptedPort];
  }
}

/** Sandboxes are secure, isolated containers in Modal that boot in seconds. */
export class Sandbox {
  readonly sandboxId: string;
  stdin: ModalWriteStream<string>;
  stdout: ModalReadStream<string>;
  stderr: ModalReadStream<string>;

  #taskId: string | undefined;
  #tunnels: Record<number, Tunnel> | undefined;

  /** @ignore */
  constructor(sandboxId: string) {
    this.sandboxId = sandboxId;

    this.stdin = toModalWriteStream(inputStreamSb(sandboxId));
    this.stdout = toModalReadStream(
      streamConsumingIter(
        outputStreamSb(sandboxId, FileDescriptor.FILE_DESCRIPTOR_STDOUT),
      ).pipeThrough(new TextDecoderStream()),
    );
    this.stderr = toModalReadStream(
      streamConsumingIter(
        outputStreamSb(sandboxId, FileDescriptor.FILE_DESCRIPTOR_STDERR),
      ).pipeThrough(new TextDecoderStream()),
    );
  }

  /**
   * Open a file in the sandbox filesystem.
   * @param path - Path to the file to open
   * @param mode - File open mode (r, w, a, r+, w+, a+)
   * @returns Promise that resolves to a SandboxFile
   */
  async open(path: string, mode: SandboxFileMode = "r"): Promise<SandboxFile> {
    const taskId = await this.#getTaskId();
    const resp = await runFilesystemExec({
      fileOpenRequest: {
        path,
        mode,
      },
      taskId,
    });
    // For Open request, the file descriptor is always set
    const fileDescriptor = resp.response.fileDescriptor as string;
    return new SandboxFile(fileDescriptor, taskId);
  }

  async exec(
    command: string[],
    options?: ExecOptions & { mode?: "text" },
  ): Promise<ContainerProcess<string>>;

  async exec(
    command: string[],
    options: ExecOptions & { mode: "binary" },
  ): Promise<ContainerProcess<Uint8Array>>;

  async exec(
    command: string[],
    options?: {
      mode?: StreamMode;
      stdout?: StdioBehavior;
      stderr?: StdioBehavior;
      workdir?: string;
      timeout?: number;
    },
  ): Promise<ContainerProcess> {
    const taskId = await this.#getTaskId();

    const resp = await client.containerExec({
      taskId,
      command,
      workdir: options?.workdir,
      timeoutSecs: options?.timeout ? options.timeout / 1000 : 0,
    });

    return new ContainerProcess(resp.execId, options);
  }

  async #getTaskId(): Promise<string> {
    if (this.#taskId === undefined) {
      const resp = await client.sandboxGetTaskId({
        sandboxId: this.sandboxId,
      });
      if (!resp.taskId) {
        throw new Error(
          `Sandbox ${this.sandboxId} does not have a task ID. It may not be running.`,
        );
      }
      if (resp.taskResult) {
        throw new Error(
          `Sandbox ${this.sandboxId} has already completed with result: ${resp.taskResult}`,
        );
      }
      this.#taskId = resp.taskId;
    }
    return this.#taskId;
  }

  async terminate(): Promise<void> {
    await client.sandboxTerminate({ sandboxId: this.sandboxId });
    this.#taskId = undefined; // Reset task ID after termination
  }

  async wait(): Promise<number> {
    while (true) {
      const resp = await client.sandboxWait({
        sandboxId: this.sandboxId,
        timeout: 55,
      });
      if (resp.result) {
        return resp.result.exitcode;
      }
    }
  }

  /** Get Tunnel metadata for the sandbox.
   *
   * Raises `SandboxTimeoutError` if the tunnels are not available after the timeout.
   *
   * @returns A dictionary of Tunnel objects which are keyed by the container port.
   */
  async tunnels(timeout = 50000): Promise<Record<number, Tunnel>> {
    if (this.#tunnels) {
      return this.#tunnels;
    }

    const resp = await client.sandboxGetTunnels({
      sandboxId: this.sandboxId,
      timeout: timeout / 1000, // Convert to seconds
    });

    if (
      resp.result?.status === GenericResult_GenericStatus.GENERIC_STATUS_TIMEOUT
    ) {
      throw new SandboxTimeoutError();
    }

    this.#tunnels = {};
    for (const t of resp.tunnels) {
      this.#tunnels[t.containerPort] = new Tunnel(
        t.host,
        t.port,
        t.unencryptedHost,
        t.unencryptedPort,
      );
    }

    return this.#tunnels;
  }
}

export class ContainerProcess<R extends string | Uint8Array = any> {
  stdin: ModalWriteStream<R>;
  stdout: ModalReadStream<R>;
  stderr: ModalReadStream<R>;
  returncode: number | null = null;

  readonly #execId: string;

  constructor(execId: string, options?: ExecOptions) {
    const mode = options?.mode ?? "text";
    const stdout = options?.stdout ?? "pipe";
    const stderr = options?.stderr ?? "pipe";

    this.#execId = execId;

    this.stdin = toModalWriteStream(inputStreamCp<R>(execId));

    let stdoutStream = streamConsumingIter(
      outputStreamCp(execId, FileDescriptor.FILE_DESCRIPTOR_STDOUT),
    );
    if (stdout === "ignore") {
      stdoutStream.cancel();
      stdoutStream = ReadableStream.from([]);
    }

    let stderrStream = streamConsumingIter(
      outputStreamCp(execId, FileDescriptor.FILE_DESCRIPTOR_STDERR),
    );
    if (stderr === "ignore") {
      stderrStream.cancel();
      stderrStream = ReadableStream.from([]);
    }

    if (mode === "text") {
      this.stdout = toModalReadStream(
        stdoutStream.pipeThrough(new TextDecoderStream()),
      ) as ModalReadStream<R>;
      this.stderr = toModalReadStream(
        stderrStream.pipeThrough(new TextDecoderStream()),
      ) as ModalReadStream<R>;
    } else {
      this.stdout = toModalReadStream(stdoutStream) as ModalReadStream<R>;
      this.stderr = toModalReadStream(stderrStream) as ModalReadStream<R>;
    }
  }

  /** Wait for process completion and return the exit code. */
  async wait(): Promise<number> {
    while (true) {
      const resp = await client.containerExecWait({
        execId: this.#execId,
        timeout: 55,
      });
      if (resp.completed) {
        return resp.exitCode ?? 0;
      }
    }
  }
}

// Like _StreamReader with object_type == "sandbox".
async function* outputStreamSb(
  sandboxId: string,
  fileDescriptor: FileDescriptor,
): AsyncIterable<Uint8Array> {
  let lastIndex = "0-0";
  let completed = false;
  let retries = 10;
  while (!completed) {
    try {
      const outputIterator = client.sandboxGetLogs({
        sandboxId,
        fileDescriptor,
        timeout: 55,
        lastEntryId: lastIndex,
      });
      for await (const batch of outputIterator) {
        lastIndex = batch.entryId;
        yield* batch.items.map((item) => new TextEncoder().encode(item.data));
        if (batch.eof) {
          completed = true;
          break;
        }
      }
    } catch (err) {
      if (isRetryableGrpc(err) && retries > 0) retries--;
      else throw err;
    }
  }
}

// Like _StreamReader with object_type == "container_process".
async function* outputStreamCp(
  execId: string,
  fileDescriptor: FileDescriptor,
): AsyncIterable<Uint8Array> {
  let lastIndex = 0;
  let completed = false;
  let retries = 10;
  while (!completed) {
    try {
      const outputIterator = client.containerExecGetOutput({
        execId,
        fileDescriptor,
        timeout: 55,
        getRawBytes: true,
        lastBatchIndex: lastIndex,
      });
      for await (const batch of outputIterator) {
        lastIndex = batch.batchIndex;
        yield* batch.items.map((item) => item.messageBytes);
        if (batch.exitCode !== undefined) {
          // The container process exited. Python code also doesn't handle this
          // exit code, so we don't either right now.
          completed = true;
          break;
        }
      }
    } catch (err) {
      if (isRetryableGrpc(err) && retries > 0) retries--;
      else throw err;
    }
  }
}

function inputStreamSb(sandboxId: string): WritableStream<string> {
  let index = 1;
  return new WritableStream<string>({
    async write(chunk) {
      await client.sandboxStdinWrite({
        sandboxId,
        input: encodeIfString(chunk),
        index,
      });
      index++;
    },
    async close() {
      await client.sandboxStdinWrite({
        sandboxId,
        index,
        eof: true,
      });
    },
  });
}

function inputStreamCp<R extends string | Uint8Array>(
  execId: string,
): WritableStream<R> {
  let messageIndex = 1;
  return new WritableStream<R>({
    async write(chunk) {
      await client.containerExecPutInput({
        execId,
        input: {
          message: encodeIfString(chunk),
          messageIndex,
        },
      });
      messageIndex++;
    },
    async close() {
      await client.containerExecPutInput({
        execId,
        input: {
          messageIndex,
          eof: true,
        },
      });
    },
  });
}

function encodeIfString(chunk: Uint8Array | string): Uint8Array {
  return typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
}
</file>

<file path="modal-js/src/secret.ts">
import { client } from "./client";
import { environmentName as configEnvironmentName } from "./config";
import { ClientError, Status } from "nice-grpc";
import { NotFoundError } from "./errors";

/** Options for `Secret.fromName()`. */
export type SecretFromNameOptions = {
  environment?: string;
  requiredKeys?: string[];
};

/** Secrets provide a dictionary of environment variables for images. */
export class Secret {
  readonly secretId: string;

  /** @ignore */
  constructor(secretId: string) {
    this.secretId = secretId;
  }

  /** Reference a Secret by its name. */
  static async fromName(
    name: string,
    options?: SecretFromNameOptions,
  ): Promise<Secret> {
    try {
      const resp = await client.secretGetOrCreate({
        deploymentName: name,
        environmentName: configEnvironmentName(options?.environment),
        requiredKeys: options?.requiredKeys ?? [],
      });
      return new Secret(resp.secretId);
    } catch (err) {
      if (err instanceof ClientError && err.code === Status.NOT_FOUND)
        throw new NotFoundError(err.details);
      if (
        err instanceof ClientError &&
        err.code === Status.FAILED_PRECONDITION &&
        err.details.includes("Secret is missing key")
      )
        throw new NotFoundError(err.details);
      throw err;
    }
  }
}
</file>

<file path="modal-js/src/serialization.test.ts">
// Test to make sure serialization behaviors are consistent.

import { expect, test } from "vitest";

import { ClassParameterSpec, ParameterType } from "../proto/modal_proto/api";
import { encodeParameterSet } from "./cls";

// Reproduce serialization test from the Python SDK.
// https://github.com/modal-labs/modal-client/blob/4c62d67ee2816146a2a5d42581f6fe7349fa1bf6/test/serialization_test.py
test("ParameterSerialization", () => {
  let schema: ClassParameterSpec[] = [
    ClassParameterSpec.fromPartial({
      name: "foo",
      type: ParameterType.PARAM_TYPE_STRING,
    }),
    ClassParameterSpec.fromPartial({
      name: "i",
      type: ParameterType.PARAM_TYPE_INT,
    }),
  ];
  const values = { i: 5, foo: "bar" };

  let serializedParams = encodeParameterSet(schema, values);
  let byteData = new Uint8Array([
    10, 12, 10, 3, 102, 111, 111, 16, 1, 26, 3, 98, 97, 114, 10, 7, 10, 1, 105,
    16, 2, 32, 5,
  ]);
  expect(serializedParams).toEqual(byteData);

  // Reverse the order of map keys and make sure it's deterministic.
  const reversedSchema = [schema[1], schema[0]];
  const reversedSerializedParams = encodeParameterSet(reversedSchema, values);
  expect(reversedSerializedParams).toEqual(byteData);

  // Test with a parameter that has a default value.
  schema = [
    ClassParameterSpec.create({
      name: "x",
      type: ParameterType.PARAM_TYPE_BYTES,
      hasDefault: true,
      bytesDefault: new Uint8Array([0]),
    }),
  ];
  serializedParams = encodeParameterSet(schema, {});
  byteData = new Uint8Array([10, 8, 10, 1, 120, 16, 4, 50, 1, 0]);
  expect(serializedParams).toEqual(byteData);
});
</file>

<file path="modal-js/src/streams.ts">
/**
 * Wrapper around `ReadableStream` with convenience functions.
 *
 * The Stream API is a modern standard for asynchronous data streams across
 * network and process boundaries. It allows you to read data in chunks, pipe
 * and transform it, and handle backpressure.
 *
 * This wrapper adds some extra functions like `.readText()` to read the entire
 * stream as a string, or `readBytes()` to read binary data.
 *
 * Background: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
 */
export interface ModalReadStream<R = any> extends ReadableStream<R> {
  /** Read the entire stream as a string. */
  readText(): Promise<string>;

  /** Read the entire stream as a byte array. */
  readBytes(): Promise<Uint8Array>;
}

/**
 * Wrapper around `WritableStream` with convenience functions.
 *
 * The Stream API is a modern standard for asynchronous data streams across
 * network and process boundaries. It allows you to read data in chunks, pipe
 * and transform it, and handle backpressure.
 *
 * This wrapper adds some extra functions like `.writeText()` to write a string
 * to the stream, or `writeBytes()` to write binary data.
 *
 * Background: https://developer.mozilla.org/en-US/docs/Web/API/Streams_API
 */
export interface ModalWriteStream<R = any> extends WritableStream<R> {
  /** Write a string to the stream. Only if this is a text stream. */
  writeText(text: string): Promise<void>;

  /** Write a byte array to the stream. Only if this is a byte stream. */
  writeBytes(bytes: Uint8Array): Promise<void>;
}

export function toModalReadStream<R extends string | Uint8Array = any>(
  stream: ReadableStream<R>,
): ModalReadStream<R> {
  return Object.assign(stream, readMixin);
}

export function toModalWriteStream<R extends string | Uint8Array = any>(
  stream: WritableStream<R>,
): ModalWriteStream<R> {
  return Object.assign(stream, writeMixin);
}

const readMixin = {
  async readText<R extends string | Uint8Array>(
    this: ReadableStream<R>,
  ): Promise<string> {
    const reader = this.getReader();
    try {
      const decoder = new TextDecoder("utf-8"); // used if binary
      const chunks: string[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          if (typeof value === "string") chunks.push(value);
          else {
            chunks.push(decoder.decode(value.buffer, { stream: true }));
          }
        }
        if (done) {
          chunks.push(decoder.decode(undefined, { stream: false })); // may be empty
          break;
        }
      }
      return chunks.join("");
    } finally {
      reader.releaseLock();
    }
  },

  async readBytes<R extends string | Uint8Array>(
    this: ReadableStream<R>,
  ): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const reader = this.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          if (typeof value === "string") {
            chunks.push(new TextEncoder().encode(value));
          } else {
            chunks.push(value);
          }
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }

    let totalLength = 0;
    for (const chunk of chunks) {
      totalLength += chunk.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  },
};

const writeMixin = {
  async writeText<R extends string | Uint8Array>(
    this: WritableStream<R>,
    text: string,
  ): Promise<void> {
    const writer = this.getWriter();
    try {
      // Cast to R so TS is happy; underlying sink must accept strings
      await writer.write(text as unknown as R);
    } finally {
      writer.releaseLock();
    }
  },

  async writeBytes<R extends string | Uint8Array>(
    this: WritableStream<R>,
    bytes: Uint8Array,
  ): Promise<void> {
    const writer = this.getWriter();
    try {
      // Cast to R so TS is happy; underlying sink must accept Uint8Array
      await writer.write(bytes as unknown as R);
    } finally {
      writer.releaseLock();
    }
  },
};

/**
 * Construct a ReadableStream from an iterator.
 * If the stream is closed, the iterator is still consumed to completion.
 */
export function streamConsumingIter(
  iterable: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iter = iterable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { done, value } = await iter.next();
        if (value) {
          controller.enqueue(value);
        }
        if (done) {
          controller.close();
        }
      },
      async cancel() {
        consumeIterator(iter);
      },
    },
    new ByteLengthQueuingStrategy({
      highWaterMark: 64 * 1024, // 64 KiB
    }),
  );
}

async function consumeIterator<T>(iter: AsyncIterator<T>) {
  while (true) {
    const { done } = await iter.next();
    if (done) break;
  }
}
</file>

<file path="modal-js/src/volume.ts">
import { ObjectCreationType } from "../proto/modal_proto/api";
import { client } from "./client";
import { environmentName as configEnvironmentName } from "./config";
import { ClientError, Status } from "nice-grpc";
import { NotFoundError } from "./errors";

/** Options for `Volume.fromName()`. */
export type VolumeFromNameOptions = {
  environment?: string;
  createIfMissing?: boolean;
};

/** Volumes provide persistent storage that can be mounted in Modal functions. */
export class Volume {
  readonly volumeId: string;

  /** @ignore */
  constructor(volumeId: string) {
    this.volumeId = volumeId;
  }

  static async fromName(
    name: string,
    options?: VolumeFromNameOptions,
  ): Promise<Volume> {
    try {
      const resp = await client.volumeGetOrCreate({
        deploymentName: name,
        environmentName: configEnvironmentName(options?.environment),
        objectCreationType: options?.createIfMissing
          ? ObjectCreationType.OBJECT_CREATION_TYPE_CREATE_IF_MISSING
          : ObjectCreationType.OBJECT_CREATION_TYPE_UNSPECIFIED,
      });
      return new Volume(resp.volumeId);
    } catch (err) {
      if (err instanceof ClientError && err.code === Status.NOT_FOUND)
        throw new NotFoundError(err.details);
      throw err;
    }
  }
}
</file>

<file path="modal-js/test/cls.test.ts">
import { expect, test } from "vitest";

import { Cls, NotFoundError } from "modal";

test("ClsCall", async () => {
  const cls = await Cls.lookup("libmodal-test-support", "EchoCls");
  const instance = await cls.instance();

  // Try accessing a non-existent method
  expect(() => instance.method("nonexistent")).toThrowError(NotFoundError);

  const function_ = instance.method("echo_string");
  const result = await function_.remote([], { s: "hello" });
  expect(result).toEqual("output: hello");

  const cls2 = await Cls.lookup("libmodal-test-support", "EchoClsParametrized");
  const instance2 = await cls2.instance({ name: "hello-init" });

  const function2 = instance2.method("echo_parameter");
  const result2 = await function2.remote();
  expect(result2).toEqual("output: hello-init");
});

test("ClsNotFound", async () => {
  const cls = Cls.lookup("libmodal-test-support", "NotRealClassName");
  await expect(cls).rejects.toThrowError(NotFoundError);
});

test("ClsCallInputPlane", async () => {
  const cls = await Cls.lookup("libmodal-test-support", "EchoClsInputPlane");
  const instance = await cls.instance();

  const function_ = instance.method("echo_string");
  const result = await function_.remote([], { s: "hello" });
  expect(result).toEqual("output: hello");
});
</file>

<file path="modal-js/test/function_call.test.ts">
import { Function_, FunctionTimeoutError } from "modal";
import { expect, test } from "vitest";

test("FunctionSpawn", async () => {
  const function_ = await Function_.lookup(
    "libmodal-test-support",
    "echo_string",
  );

  // Spawn function with kwargs.
  let functionCall = await function_.spawn([], { s: "hello" });
  expect(functionCall.functionCallId).toBeDefined();

  // Get results after spawn.
  let resultKwargs = await functionCall.get();
  expect(resultKwargs).toBe("output: hello");

  // Try the same again; same results should still be available.
  resultKwargs = await functionCall.get();
  expect(resultKwargs).toBe("output: hello");

  // Lookup function that takes a long time to complete.
  const sleep = await Function_.lookup("libmodal-test-support", "sleep");

  // Spawn with long running input.
  functionCall = await sleep.spawn([], { t: 5 });
  expect(functionCall.functionCallId).toBeDefined();

  // Getting outputs with timeout raises error.
  const promise = functionCall.get({ timeout: 1000 }); // 1000ms
  await expect(promise).rejects.toThrowError(FunctionTimeoutError);
});

test("FunctionCallGet0", async () => {
  const sleep = await Function_.lookup("libmodal-test-support", "sleep");

  const call = await sleep.spawn([0.5]);
  // Polling for output with timeout 0 should raise an error, since the
  // function call has not finished yet.
  await expect(call.get({ timeout: 0 })).rejects.toThrowError(
    FunctionTimeoutError,
  );

  expect(await call.get()).toBe(null); // Wait for the function call to finish.
  expect(await call.get({ timeout: 0 })).toBe(null); // Now we can get the result.
});
</file>

<file path="modal-js/test/function.test.ts">
import { Function_, NotFoundError } from "modal";
import { expect, test } from "vitest";

test("FunctionCall", async () => {
  const function_ = await Function_.lookup(
    "libmodal-test-support",
    "echo_string",
  );

  // Represent Python kwargs.
  const resultKwargs = await function_.remote([], { s: "hello" });
  expect(resultKwargs).toBe("output: hello");

  // Try the same, but with args.
  const resultArgs = await function_.remote(["hello"]);
  expect(resultArgs).toBe("output: hello");
});

test("FunctionCallLargeInput", async () => {
  const function_ = await Function_.lookup(
    "libmodal-test-support",
    "bytelength",
  );
  const len = 3 * 1000 * 1000; // More than 2 MiB, offload to blob storage
  const input = new Uint8Array(len);
  const result = await function_.remote([input]);
  expect(result).toBe(len);
});

test("FunctionNotFound", async () => {
  const promise = Function_.lookup(
    "libmodal-test-support",
    "not_a_real_function",
  );
  await expect(promise).rejects.toThrowError(NotFoundError);
});

test("FunctionCallInputPlane", async () => {
  const function_ = await Function_.lookup(
    "libmodal-test-support",
    "input_plane",
  );
  const result = await function_.remote(["hello"]);
  expect(result).toBe("output: hello");
});
</file>

<file path="modal-js/test/image.test.ts">
import { App, Secret } from "modal";
import { expect, test } from "vitest";

test("ImageFromRegistry", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  expect(app.appId).toBeTruthy();

  const image = await app.imageFromRegistry("alpine:3.21");
  expect(image.imageId).toBeTruthy();
  expect(image.imageId).toMatch(/^im-/);
});

test("ImageFromRegistryWithSecret", async () => {
  // GCP Artifact Registry also supports auth using username and password, if the username is "_json_key"
  // and the password is the service account JSON blob. See:
  // https://cloud.google.com/artifact-registry/docs/docker/authentication#json-key
  // So we use GCP Artifact Registry to test this too.

  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  expect(app.appId).toBeTruthy();

  const image = await app.imageFromRegistry(
    "us-east1-docker.pkg.dev/modal-prod-367916/private-repo-test/my-image",
    await Secret.fromName("libmodal-gcp-artifact-registry-test", {
      requiredKeys: ["REGISTRY_USERNAME", "REGISTRY_PASSWORD"],
    }),
  );
  expect(image.imageId).toBeTruthy();
  expect(image.imageId).toMatch(/^im-/);
});

test("ImageFromAwsEcr", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  expect(app.appId).toBeTruthy();

  const image = await app.imageFromAwsEcr(
    "459781239556.dkr.ecr.us-east-1.amazonaws.com/ecr-private-registry-test-7522615:python",
    await Secret.fromName("libmodal-aws-ecr-test", {
      requiredKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    }),
  );
  expect(image.imageId).toBeTruthy();
  expect(image.imageId).toMatch(/^im-/);
});

test("ImageFromGcpArtifactRegistry", { timeout: 30_000 }, async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  expect(app.appId).toBeTruthy();

  const image = await app.imageFromGcpArtifactRegistry(
    "us-east1-docker.pkg.dev/modal-prod-367916/private-repo-test/my-image",
    await Secret.fromName("libmodal-gcp-artifact-registry-test", {
      requiredKeys: ["SERVICE_ACCOUNT_JSON"],
    }),
  );
  expect(image.imageId).toBeTruthy();
  expect(image.imageId).toMatch(/^im-/);
});
</file>

<file path="modal-js/test/queue.test.ts">
import { Queue, QueueEmptyError } from "modal";
import { expect, test } from "vitest";

test("QueueInvalidName", async () => {
  for (const name of ["has space", "has/slash", "a".repeat(65)]) {
    await expect(Queue.lookup(name)).rejects.toThrow();
  }
});

test("QueueEphemeral", async () => {
  const queue = await Queue.ephemeral();
  await queue.put(123);
  expect(await queue.len()).toBe(1);
  expect(await queue.get()).toBe(123);
  queue.closeEphemeral();
});

test("QueueSuite1", async () => {
  const queue = await Queue.ephemeral();
  expect(await queue.len()).toBe(0);

  await queue.put(123);
  expect(await queue.len()).toBe(1);
  expect(await queue.get()).toBe(123);

  await queue.put(432);
  expect(await queue.get({ timeout: 0 })).toBe(432);

  await expect(queue.get({ timeout: 0 })).rejects.toThrow(QueueEmptyError);
  expect(await queue.len()).toBe(0);

  await queue.putMany([1, 2, 3]);
  const results: number[] = [];
  for await (const item of queue.iterate()) {
    results.push(item);
  }
  expect(results).toEqual([1, 2, 3]);
  queue.closeEphemeral();
});

test("QueueSuite2", async () => {
  const results: number[] = [];
  const producer = async (queue: Queue) => {
    for (let i = 0; i < 10; i++) {
      await queue.put(i);
    }
  };

  const consumer = async (queue: Queue) => {
    for await (const item of queue.iterate({ itemPollTimeout: 1000 })) {
      results.push(item);
    }
  };

  const queue = await Queue.ephemeral();
  await Promise.all([producer(queue), consumer(queue)]);
  expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  queue.closeEphemeral();
});

test("QueuePutAndGetMany", async () => {
  const queue = await Queue.ephemeral();
  await queue.putMany([1, 2, 3]);
  expect(await queue.len()).toBe(3);
  expect(await queue.getMany(3)).toEqual([1, 2, 3]);
  queue.closeEphemeral();
});

test("QueueNonBlocking", async () => {
  // Assuming the queue is available, these operations
  // Should succeed immediately.
  const queue = await Queue.ephemeral();
  await queue.put(123, { timeout: 0 });
  expect(await queue.len()).toBe(1);
  expect(await queue.get({ timeout: 0 })).toBe(123);
  queue.closeEphemeral();
});
</file>

<file path="modal-js/test/sandbox_filesystem.test.ts">
import { App } from "modal";
import { expect, test, onTestFinished } from "vitest";

test("WriteAndReadBinaryFile", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");
  const sb = await app.createSandbox(image);
  onTestFinished(async () => {
    await sb.terminate();
  });

  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // Write binary data
  const writeHandle = await sb.open("/tmp/test.bin", "w");
  await writeHandle.write(testData);
  await writeHandle.close();

  // Read binary data
  const readHandle = await sb.open("/tmp/test.bin", "r");
  const readData = await readHandle.read();
  expect(readData).toEqual(testData);
  await readHandle.close();
});

test("AppendToFileBinary", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");
  const sb = await app.createSandbox(image);
  onTestFinished(async () => {
    await sb.terminate();
  });

  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // Write initial content
  const writeHandle = await sb.open("/tmp/append.txt", "w");
  await writeHandle.write(testData);
  await writeHandle.close();

  // Append more content
  const moreTestData = new Uint8Array([7, 8, 9, 10]);
  const appendHandle = await sb.open("/tmp/append.txt", "a");
  await appendHandle.write(moreTestData);
  await appendHandle.close();

  // Read the entire file
  const readHandle = await sb.open("/tmp/append.txt", "r");
  const content = await readHandle.read();
  const expectedData = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 7, 8, 9, 10,
  ]);
  expect(content).toEqual(expectedData);
  await readHandle.close();
});

test("FileHandleFlush", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");
  const sb = await app.createSandbox(image);
  onTestFinished(async () => {
    await sb.terminate();
  });

  const encodedData = new TextEncoder().encode("Test data");

  const handle = await sb.open("/tmp/flush.txt", "w");
  await handle.write(encodedData);
  await handle.flush(); // Ensure data is written to disk
  await handle.close();

  // Verify the data was written
  const readHandle = await sb.open("/tmp/flush.txt", "r");
  const content = await readHandle.read();
  expect(content).toEqual(encodedData);
  await readHandle.close();
});

test("MultipleFileOperations", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");
  const sb = await app.createSandbox(image);
  onTestFinished(async () => {
    await sb.terminate();
  });

  // Create multiple files
  const encoder = new TextEncoder();
  const content1 = encoder.encode("File 1 content");
  const handle1 = await sb.open("/tmp/file1.txt", "w");
  await handle1.write(content1);
  await handle1.close();

  const handle2 = await sb.open("/tmp/file2.txt", "w");
  const content2 = encoder.encode("File 2 content");
  await handle2.write(content2);
  await handle2.close();

  // Read both files
  const read1 = await sb.open("/tmp/file1.txt", "r");
  const readContent1 = await read1.read();
  await read1.close();

  const read2 = await sb.open("/tmp/file2.txt", "r");
  const readContent2 = await read2.read();
  await read2.close();

  expect(readContent1).toEqual(content1);
  expect(readContent2).toEqual(content2);
});

test("FileOpenModes", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");
  const sb = await app.createSandbox(image);
  onTestFinished(async () => {
    await sb.terminate();
  });

  // Test write mode (truncates)
  const encoder = new TextEncoder();
  const content1 = encoder.encode("Initial content");
  const writeHandle = await sb.open("/tmp/modes.txt", "w");
  await writeHandle.write(content1);
  await writeHandle.close();

  // Test read mode
  const readHandle = await sb.open("/tmp/modes.txt", "r");
  const readContent1 = await readHandle.read();
  expect(readContent1).toEqual(content1);
  await readHandle.close();

  // Test append mode
  const appendContent = encoder.encode(" appended");
  const appendHandle = await sb.open("/tmp/modes.txt", "a");
  await appendHandle.write(appendContent);
  await appendHandle.close();

  // Verify append worked
  const expectedContent = encoder.encode("Initial content appended");
  const finalRead = await sb.open("/tmp/modes.txt", "r");
  const finalContent = await finalRead.read();
  expect(finalContent).toEqual(expectedContent);
  await finalRead.close();
});

test("LargeFileOperations", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");
  const sb = await app.createSandbox(image);
  onTestFinished(async () => {
    await sb.terminate();
  });

  // Create a larger file
  const encoder = new TextEncoder();
  const largeData = encoder.encode("x".repeat(1000));

  const writeHandle = await sb.open("/tmp/large.txt", "w");
  await writeHandle.write(largeData);
  await writeHandle.close();

  // Read it back
  const readHandle = await sb.open("/tmp/large.txt", "r");
  const content = await readHandle.read();
  expect(content).toEqual(largeData);
  expect(content.length).toBe(1000);
  await readHandle.close();
});
</file>

<file path="modal-js/test/sandbox.test.ts">
import { App, Volume } from "modal";
import { expect, test } from "vitest";

test("CreateOneSandbox", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  expect(app.appId).toBeTruthy();

  const image = await app.imageFromRegistry("alpine:3.21");
  expect(image.imageId).toBeTruthy();

  const sb = await app.createSandbox(image);
  expect(sb.sandboxId).toBeTruthy();
  await sb.terminate();
  expect(await sb.wait()).toBe(0);
});

test("PassCatToStdin", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");

  // Spawn a sandbox running the "cat" command.
  const sb = await app.createSandbox(image, { command: ["cat"] });

  // Write to the sandbox's stdin and read from its stdout.
  await sb.stdin.writeText("this is input that should be mirrored by cat");
  await sb.stdin.close();
  expect(await sb.stdout.readText()).toBe(
    "this is input that should be mirrored by cat",
  );

  // Terminate the sandbox.
  await sb.terminate();
});

test("IgnoreLargeStdout", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("python:3.13-alpine");

  const sb = await app.createSandbox(image);
  try {
    const p = await sb.exec(["python", "-c", `print("a" * 1_000_000)`], {
      stdout: "ignore",
    });
    expect(await p.stdout.readText()).toBe(""); // Stdout is ignored
    // Stdout should be consumed after cancel, without blocking the process.
    expect(await p.wait()).toBe(0);
  } finally {
    await sb.terminate();
  }
});

test("SandboxExecOptions", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");

  const sb = await app.createSandbox(image);
  try {
    // Test with a custom working directory and timeout.
    const p = await sb.exec(["pwd"], {
      workdir: "/tmp",
      timeout: 5000,
    });

    expect(await p.stdout.readText()).toBe("/tmp\n");
    expect(await p.wait()).toBe(0);
  } finally {
    await sb.terminate();
  }
});

test("SandboxWithVolume", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");

  const volume = await Volume.fromName("libmodal-test-sandbox-volume", {
    createIfMissing: true,
  });

  const sandbox = await app.createSandbox(image, {
    command: ["echo", "volume test"],
    volumes: { "/mnt/test": volume },
  });

  expect(sandbox).toBeDefined();
  expect(sandbox.sandboxId).toMatch(/^sb-/);

  const exitCode = await sandbox.wait();
  expect(exitCode).toBe(0);
});

test("SandboxWithTunnels", async () => {
  const app = await App.lookup("libmodal-test", { createIfMissing: true });
  const image = await app.imageFromRegistry("alpine:3.21");

  const sandbox = await app.createSandbox(image, {
    command: ["cat"],
    encryptedPorts: [8443],
    unencryptedPorts: [8080],
  });

  expect(sandbox).toBeDefined();
  expect(sandbox.sandboxId).toMatch(/^sb-/);

  const tunnels = await sandbox.tunnels();
  expect(Object.keys(tunnels)).toHaveLength(2);

  // Test encrypted tunnel (port 8443)
  const encryptedTunnel = tunnels[8443];
  expect(encryptedTunnel.host).toMatch(/\.modal\.host$/);
  expect(encryptedTunnel.port).toBe(443);
  expect(encryptedTunnel.url).toMatch(/^https:\/\//);
  expect(encryptedTunnel.tlsSocket).toEqual([
    encryptedTunnel.host,
    encryptedTunnel.port,
  ]);

  // Test unencrypted tunnel (port 8080)
  const unencryptedTunnel = tunnels[8080];
  expect(unencryptedTunnel.unencryptedHost).toMatch(/\.modal\.host$/);
  expect(typeof unencryptedTunnel.unencryptedPort).toBe("number");
  expect(unencryptedTunnel.tcpSocket).toEqual([
    unencryptedTunnel.unencryptedHost,
    unencryptedTunnel.unencryptedPort,
  ]);

  await sandbox.terminate();
});
</file>

<file path="modal-js/test/secret.test.ts">
import { Secret } from "modal";
import { expect, test } from "vitest";

test("SecretFromName", async () => {
  const secret = await Secret.fromName("libmodal-test-secret");
  expect(secret).toBeDefined();
  expect(secret.secretId).toBeDefined();
  expect(secret.secretId).toMatch(/^st-/);

  const promise = Secret.fromName("missing-secret");
  await expect(promise).rejects.toThrowError(
    /Secret 'missing-secret' not found/,
  );
});

test("SecretFromNameWithRequiredKeys", async () => {
  const secret = await Secret.fromName("libmodal-test-secret", {
    requiredKeys: ["a", "b", "c"],
  });
  expect(secret).toBeDefined();

  const promise = Secret.fromName("libmodal-test-secret", {
    requiredKeys: ["a", "b", "c", "missing-key"],
  });
  await expect(promise).rejects.toThrowError(
    /Secret is missing key\(s\): missing-key/,
  );
});
</file>

<file path="modal-js/test/volume.test.ts">
import { Volume } from "modal";
import { expect, test } from "vitest";

test("VolumeFromName", async () => {
  const volume = await Volume.fromName("libmodal-test-volume", {
    createIfMissing: true,
  });
  expect(volume).toBeDefined();
  expect(volume.volumeId).toBeDefined();
  expect(volume.volumeId).toMatch(/^vo-/);

  const promise = Volume.fromName("missing-volume");
  await expect(promise).rejects.toThrowError(
    /Volume 'missing-volume' not found/,
  );
});
</file>

<file path="modal-js/.gitignore">
node_modules/
dist/
proto/
docs/
</file>

<file path="modal-js/eslint.config.js">
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "docs", "proto"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: { globals: globals.node },
  },
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // We added this lint because `tsx` gets confused when you export types
      // without using the `type` keyword.
      "@typescript-eslint/consistent-type-exports": "error",
      "object-shorthand": "warn",
    },
  },
]);
</file>

<file path="modal-js/package.json">
{
  "name": "modal",
  "version": "0.3.14",
  "description": "Modal client library for JavaScript",
  "license": "Apache-2.0",
  "homepage": "https://modal.com/docs",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/modal-labs/libmodal.git"
  },
  "bugs": "https://github.com/modal-labs/libmodal/issues",
  "type": "module",
  "sideEffects": false,
  "files": [
    "/dist"
  ],
  "main": "dist/index.js",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "types": "dist/index.d.ts",
  "module": "dist/index.js",
  "scripts": {
    "build": "tsup",
    "check": "tsc",
    "docs": "typedoc src/index.ts --treatWarningsAsErrors",
    "docs:serve": "npm run docs && http-server ./docs",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint",
    "prepare": "scripts/gen-proto.sh",
    "test": "vitest",
    "version": "npm run check && git add -A && git commit -m \"modal-js/v$npm_package_version\"",
    "prepublishOnly": "npm run build && git push",
    "postpublish": "git tag modal-js/v$npm_package_version && git push --tags"
  },
  "dependencies": {
    "long": "^5.3.1",
    "nice-grpc": "^2.1.12",
    "protobufjs": "^7.5.0",
    "smol-toml": "^1.3.3",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.28.0",
    "@types/node": "^22.15.2",
    "eslint": "^9.28.0",
    "globals": "^16.2.0",
    "grpc-tools": "^1.13.0",
    "http-server": "^14.1.1",
    "p-queue": "^8.1.0",
    "prettier": "^3.5.3",
    "ts-proto": "^2.7.0",
    "tsup": "^8.4.0",
    "tsx": "^4.19.3",
    "typedoc": "^0.28.5",
    "typescript": "~5.8.3",
    "typescript-eslint": "^8.33.1",
    "vitest": "^3.1.2"
  }
}
</file>

<file path="modal-js/README.md">
# Modal JavaScript Library

[![Documentation](https://img.shields.io/badge/docs-reference-blue)](https://modal-labs.github.io/libmodal/)
[![Version](https://img.shields.io/npm/v/modal.svg)](https://www.npmjs.org/package/modal)
[![Build Status](https://github.com/modal-labs/libmodal/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/modal-labs/libmodal/actions?query=branch%3Amain)
[![Downloads](https://img.shields.io/npm/dm/modal.svg)](https://www.npmjs.com/package/modal)

The [Modal](https://modal.com/) JavaScript SDK allows you to run Modal Functions and Sandboxes from server-side JavaScript applications.

It comes with built-in TypeScript type definitions.

## Documentation

See the [documentation and examples](https://github.com/modal-labs/libmodal?tab=readme-ov-file#javascript-modal-js) on GitHub.

## Requirements

Node 22 or higher. We bundle both ES Modules and CommonJS formats, so you can load the package with either `import` or `require()` in any project.

## Installation

Install the package with

```bash
npm install modal
```
</file>

<file path="modal-js/tsconfig.json">
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "modal": ["./src/index.ts"]
    }
  },
  "include": ["src", "examples", "test", "*.config.ts"]
}
</file>

<file path="modal-js/tsup.config.ts">
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
</file>

<file path="modal-js/vitest.config.ts">
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxConcurrency: 10,
    slowTestThreshold: 5_000,
    testTimeout: 20_000,
    reporters: ["verbose"],
  },
});
</file>

</files>
