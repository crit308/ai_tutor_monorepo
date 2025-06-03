Thanks! I’ll investigate how to securely implement Convex Auth in a Next.js app, including integration with both Convex client functions and HTTP Actions. I’ll also look into precautions and common issues—especially around the mismatch between `.convex.site` and `.convex.cloud` in JWT tokens.

I’ll let you know as soon as I’ve gathered the full details.


# Secure Implementation of Convex Auth in a Next.js Application

## Overview of Convex Auth in Next.js

Convex Auth is a built-in authentication system for Convex (a backend platform) that integrates with your Next.js app to handle user sign-up, login, and session management. In a Next.js application, you’ll typically use Convex’s React client library to connect to your Convex backend and its Auth hooks to manage authentication state. Convex Auth issues JSON Web Tokens (JWTs) for authenticated users and stores authentication state (user accounts and sessions) in Convex tables. A secure implementation requires careful integration of Convex Auth in your client (Next.js) and server (Convex functions), proper use of tokens in **Convex client functions** and **HTTP actions**, and adherence to best practices around session management and configuration.

Before diving in, ensure you have set up Convex Auth by generating and storing the necessary keys and environment variables. Convex provides a CLI tool to initialize auth or you can follow the manual steps: set your `SITE_URL` (the URL of your Next.js site) in the Convex deployment’s environment, generate an RSA key pair for JWT signing (`JWT_PRIVATE_KEY` and `JWKS`), and configure Convex Auth in your project. These values must be stored in the Convex dashboard’s environment variables (**not** in your Next.js `.env` files). With the groundwork in place, you can proceed to integrate Convex Auth securely.

## Integrating Convex Auth with Convex Functions

Convex **functions** (queries, mutations, and actions) run on your Convex backend and can use the user’s authentication information to enforce access controls or personalize data. When Convex Auth is enabled, each function’s context (`ctx`) includes an `auth` property that lets you retrieve the **current user’s identity**. The critical practice is to check for an authenticated user inside any function that should be protected:

```ts
import { mutation } from "./_generated/server";

export const myProtectedMutation = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Unauthenticated call to mutation");
    }
    // ... proceed with authorized logic ...
  },
});
```

In the above example, the function uses `ctx.auth.getUserIdentity()` to get the user’s identity and **throws an error if no user is logged in** (i.e. the call is unauthenticated). This pattern ensures that only authenticated users can execute that function’s logic. Convex also provides convenience helpers like `getAuthUserId(ctx)` which directly returns the logged-in user’s document ID (or `null` if not logged in). Using these helpers can simplify access checks; for instance, you might fetch the user’s profile in a query by calling `const userId = await getAuthUserId(ctx)` and then `ctx.db.get(userId)`.

Every `UserIdentity` obtained from Convex Auth includes at least a `subject` (user ID), an `issuer` (the authentication provider’s domain), and a `tokenIdentifier` (a unique combination of subject and issuer). For Convex’s own auth provider, the issuer will be your Convex deployment’s domain. (Note: By default this domain is on `*.convex.site`, which we discuss in the issues section.) You can trust these fields in your Convex functions to identify the user. Use them to implement authorization logic—e.g. comparing `identity.subject` against an item’s owner ID in a database query to enforce that users can only access their own data.

**Key Points:** Always validate authentication in protected Convex functions. If a function should only be used by logged-in users, check `ctx.auth.getUserIdentity()` or `getAuthUserId` and **throw an error or return early** if it’s `null`. This pattern guards your backend against unauthorized access. You might also structure your Convex functions such that unauthenticated calls simply return nothing or a polite error message, depending on the use case. By integrating these checks, your Convex backend becomes aware of the Next.js frontend’s auth state and can respond accordingly (for example, rejecting mutations that attempt to write data without a valid user session).

## Using Convex Auth with HTTP Actions

Convex **HTTP actions** allow you to expose certain Convex function endpoints over HTTPS, which is useful for scenarios like webhooks, file uploads, or server-to-server communication. When calling these HTTP endpoints from your Next.js app (or any client), you should include the Convex Auth token to authenticate the request. Convex supports this by accepting a JWT access token in the `Authorization` header of the HTTP request. On the server side, the HTTP action’s context can then access `ctx.auth.getUserIdentity()` just like a normal Convex function to get the user info and enforce auth.

**Client-side token retrieval:** In your Next.js app, you can get the current Convex JWT by using the `useAuthToken()` hook provided by Convex’s React library. For example:

```tsx
import { useAuthToken } from "@convex-dev/auth/react";

function uploadFile(data) {
  const token = useAuthToken();
  // Use an environment variable for your Convex site URL (ends with .convex.site)
  const res = fetch(`${process.env.NEXT_PUBLIC_CONVEX_SITE_URL}/uploadImage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: data,
  });
  // ...
}
```

Here, `useAuthToken()` returns the JWT for the currently logged-in user, and we include it as a Bearer token in the `Authorization` header when calling the Convex HTTP action. You should **configure an environment variable** (e.g. `NEXT_PUBLIC_CONVEX_SITE_URL`) with your Convex deployment’s HTTP base URL, which you can find in the Convex dashboard. This URL will look like `https://<your-deployment>.convex.site` – note the `.convex.site` domain. It’s important to use the `.convex.site` address (the dedicated domain for HTTP endpoints) and not the `.convex.cloud` address when making direct HTTP requests. In practice, your `.env.local` might have `NEXT_PUBLIC_CONVEX_SITE_URL="https://example-123.convex.site"` which we concatenate with the endpoint path in the fetch call.

On the server side, define your HTTP actions using Convex’s `httpRouter`. Convex provides a method to easily integrate auth with HTTP routes – in fact, when you set up Convex Auth, it registers the necessary OpenID Connect endpoints on your Convex deployment’s domain. In your `convex/http.ts`, you should attach these auth routes and any custom routes. For example, the Convex Auth setup might include:

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth"; // from convex/auth.ts set up by Convex Auth

const http = httpRouter();
auth.addHttpRoutes(http); // adds Convex Auth’s built-in routes (token, sign-in callbacks, etc.)

// Your custom HTTP action route
http.route({
  path: "/uploadImage",
  method: "POST",
  handler: async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return new Response("Unauthorized", { status: 401 });
    }
    // ... handle the file upload, perhaps using ctx.storage and ctx.db ...
    return new Response("OK", { status: 200 });
  },
});
export default http;
```

When a request comes in to `/uploadImage` with a valid `Authorization: Bearer <token>` header, Convex will verify the JWT against your JWKS (the public key) and populate `ctx.auth` with the user’s identity. You can then use `ctx.auth.getUserIdentity()` in the handler to get user info or simply trust that if it’s not null, the user is authenticated. In the example above, we reject the request with 401 if no valid auth is present.

**CORS considerations:** Because your Next.js app is likely served on a different origin (domain) than the Convex backend, you must handle Cross-Origin Resource Sharing for HTTP actions. By default, browsers will block cross-origin requests to your Convex `.convex.site` domain unless the correct CORS headers are returned. This is especially true when including an Authorization header, which triggers a preflight OPTIONS request. To allow your Next.js frontend to call Convex HTTP endpoints, add appropriate CORS headers in your HTTP action responses. For example, you can set the `Access-Control-Allow-Origin` header to your site’s URL and handle OPTIONS requests:

```ts
// Inside your HTTP action handler, e.g. at the end of /uploadImage handler:
return new Response(responseBody, {
  status: 200,
  headers: {
    "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN!,  // e.g. https://myapp.com
    "Vary": "Origin"
    // ... any other headers like Access-Control-Allow-Headers if needed ...
  }
});

// And define an OPTIONS handler for preflight:
http.route({
  path: "/uploadImage",
  method: "OPTIONS",
  handler: async (_, request) => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN!,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
});
```

In the above, `CLIENT_ORIGIN` would be another environment variable in Convex (set it to your Next.js app’s URL, e.g. `http://localhost:3000` in dev or your production domain). This ensures that only your domain is allowed to call these endpoints. Adding CORS handling is a **best practice for security**, so that other sites cannot abuse your open endpoints using a logged-in user’s credentials.

**Summary:** To use Convex Auth with HTTP actions, fetch the Convex JWT token on the client (with `useAuthToken()` or similar) and include it in the request header. Ensure you call the correct Convex base URL (`<deployment>.convex.site`). On the server, the token will be verified and you can call `ctx.auth.getUserIdentity()` to enforce authentication in the handler. Don’t forget to implement CORS restrictions on those routes so that your Next.js app can communicate with Convex securely from the browser.

## Precautions and Best Practices for Convex Auth

Using Convex Auth introduces powerful capabilities, but also responsibilities to keep the authentication system secure. Here are some key precautions and best practices:

* **Store secrets securely:** Never expose your Convex JWT private key or other auth secrets in your Next.js code. These should live in Convex’s protected environment variables. For example, after generating your `JWT_PRIVATE_KEY` and `JWKS`, **store them via the Convex dashboard** (or CLI) on your deployment. The Convex functions will read them from `process.env` on the server side. In development, you can use `npx convex env set` to set env vars for your dev deployment, and `npx @convex-dev/auth --prod` to initialize them for production. Keep these keys secret — do not commit them to Git or .env files that go to the client.

* **Use environment variables for configuration:** To maintain consistency across environments (development, staging, production), use environment variables for any URLs or keys needed by Convex Auth. In your Next.js app, Convex will usually pick up `NEXT_PUBLIC_CONVEX_URL` (or `VITE_CONVEX_URL`) to know which Convex deployment to connect to (for real-time queries/mutations). Set this to your deployment’s `.convex.cloud` URL for the appropriate environment (Convex CLI often sets it automatically on deploy). Likewise, define a `NEXT_PUBLIC_CONVEX_SITE_URL` for the `.convex.site` base URL if you plan to call HTTP actions. On the Convex side, ensure `SITE_URL` is set to your Next.js app’s URL (especially needed for OAuth redirects and magic link emails). The table below summarizes important variables:

| Environment Variable                              | Where to Set                 | Purpose and Best Practices                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SITE\_URL** (Convex env)                        | Convex Deployment (Dev/Prod) | The URL of your frontend app (e.g. `http://localhost:3000` or your Vercel prod domain). Used by Convex Auth for redirecting back to your site during OAuth flows and for magic link emails. Must match your actual app origin for those features to work.                                         |
| **JWT\_PRIVATE\_KEY** (Convex env)                | Convex Deployment            | Private key for signing Convex Auth JWTs. Generated via Convex CLI or script. **Keep this secret** in Convex backend config. Never expose it client-side.                                                                                                                                         |
| **JWKS** (Convex env)                             | Convex Deployment            | JSON Web Key Set (public key) corresponding to the private key, used by Convex to verify JWT signatures. Store in Convex env. (Clients and Convex internals use this to validate tokens).                                                                                                         |
| **NEXT\_PUBLIC\_CONVEX\_URL** (Next.js env)       | Next.js (Dev/Prod)           | The **public** URL for your Convex backend used by the Convex client library in the browser (e.g. `https://happy-otter-123.convex.cloud`). This is provided in your Convex dashboard. Use the `.convex.cloud` URL here. In production, deploying via Convex CLI often injects this automatically. |
| **NEXT\_PUBLIC\_CONVEX\_SITE\_URL** (Next.js env) | Next.js (Dev/Prod)           | The base URL for Convex HTTP actions (e.g. `https://happy-otter-123.convex.site`). This is needed if you call HTTP endpoints from the client, since those endpoints reside on the `.convex.site` domain. Set this in your environment and use it in fetch calls.                                  |
| **CLIENT\_ORIGIN** (Convex env, optional)         | Convex Deployment            | Your frontend’s origin, used if you implement CORS in Convex HTTP actions. For example, set `CLIENT_ORIGIN="https://myapp.vercel.app"` in Convex env and reference it to allow that origin in responses.                                                                                          |
| **Provider-specific secrets** (Convex env)        | Convex Deployment            | If using third-party OAuth providers (Google, GitHub, etc.), store their client IDs, secrets, API keys in Convex env. Convex Auth will read them for the OAuth flows. Never put these secrets in the public Next.js config.                                                                       |

Using these variables ensures that your app is correctly configured in all environments and that sensitive values are not hard-coded. For instance, in development you might have a different Convex deployment (and thus different URLs and keys) than in production; separating these via env vars prevents mistakes and leakage.

* **Protect tokens on the client:** Convex Auth uses JWT access tokens and refresh tokens to maintain user sessions. By default, if you use Convex Auth in a plain React or Next.js app without special configuration, **both tokens are stored in `localStorage`** in the browser. This is done because Convex backend runs on a different origin (making cookies less straightforward) and to support environments like React Native where cookies may not work. However, storing tokens in `localStorage` means they are accessible to JavaScript, which poses a risk if an XSS vulnerability is present in your app (an attacker could steal tokens via script). To mitigate this:

  * **Avoid XSS vulnerabilities** by following React best practices (do not dangerously inject HTML, sanitize user inputs, etc.). React’s default escaping helps, but be vigilant especially if using any third-party DOM-manipulating libraries.
  * **Use Convex’s Next.js integration** if you are building a Next.js app. Convex offers `@convex-dev/auth/nextjs` which stores the refresh token and session ID in an **HttpOnly cookie** (tied to your domain) instead of localStorage. Only the short-lived access token is exposed to client JS in this case, significantly reducing the impact of XSS (since an attacker cannot steal the refresh token easily). The Next.js integration also automatically protects against CSRF attacks for the cookie-based tokens. To set this up, ensure you use the `<ConvexProviderWithAuth>` in your custom `_app` or Root layout, and configure Next.js `middleware.ts` to protect pages (more on this below).
  * **Require re-authentication for sensitive actions**. Convex Auth supports prompting the user to sign in again if needed (for example, before performing a high-risk action like changing an email or making a payment). While not always necessary, this adds security by ensuring that even if a JWT was stolen, the attacker can’t easily reuse it for critical operations without the user reconfirming credentials. You can implement this by tracking the `updatedAt` or a last login timestamp from the identity token and enforcing a threshold for certain actions (or by simply asking the user to log in again via your UI flow).
  * **Implement Logout and Session Expiry**: Always provide a way for users to log out (`useAuthActions().signOut()` will clear the session on client and Convex). Convex Auth’s session tokens expire automatically (by default, access tokens expire after 1 hour). The Convex client will use the refresh token to obtain a new access token as needed, until the refresh token expires (Convex sets a refresh token lifespan, e.g., 7 days by default, configurable). As a developer, you should understand this lifecycle: after a refresh token expires or is invalidated (e.g., by logout), the user will need to sign in again. It’s good practice to inform the user or seamlessly redirect them to a login page if their session expires.
  * **Server-side session checks**: If you are using Next.js App Router, leverage Convex’s Next.js middleware to protect routes. Using `convexAuthNextjsMiddleware` in `middleware.ts` allows you to require authentication for certain pages or API routes and even redirect users who aren’t authenticated. For example, you can define patterns for protected routes and use `convexAuth.isAuthenticated()` to conditionally redirect to a sign-in page. This ensures that secure pages are not even rendered unless the user has a valid session (the middleware reads the Convex Auth cookies on the server to determine this). Setting up this route protection is a best practice to avoid unauthorized page access via URL manipulation.
  * **Limit session scope and privileges**: If your app implements roles or permissions, encode those either in the user document or as custom claims in the JWT if using an external IdP. Convex Auth’s built-in JWT contains basic profile info (name, email, etc.), but you can attach roles in the Convex `users` table and check them in functions. Ensure that your Convex functions not only check for authentication but also for the user’s authorization level if needed (e.g., an “admin” field on the user). This way, even a valid authenticated user token can’t be used to perform actions beyond that user’s rights.

* **Monitor and manage sessions:** Convex Auth creates a new entry in an `authSessions` table for each login session (and a `users` table entry for each user). You can use these tables to monitor active sessions (e.g., list how many sessions a user has open). If you suspect a compromise, you can revoke sessions by deleting those `authSessions` documents – for example, in an emergency you could clear the entire `authSessions` table to force logout of all users. This is a drastic measure but effective if needed (for instance, if a vulnerability is discovered and you want everyone to re-authenticate). After such a move, consider **rotating your JWT signing keys** as well. Convex CLI can generate new keys (`npx @convex-dev/auth --prod` with a prompt, or manually updating `JWT_PRIVATE_KEY` and `JWKS`) to invalidate all old tokens immediately. Regular key rotation is a good security hygiene practice, though Convex doesn’t force it, you have the tools to do so when appropriate.

* **Keep dependencies updated**: Convex Auth relies on JSON Web Tokens and cryptography under the hood. It’s wise to keep your Convex packages up-to-date to benefit from any security fixes. Also keep your Next.js and React updated, and review your other dependencies for vulnerabilities (to mitigate supply-chain attacks). A vulnerable React component or library could be an avenue for XSS, so security is as strong as the weakest link.

In summary, treat your Convex Auth implementation with the same care as any authentication system. Use Convex’s tools (like the Next.js adapter and server middleware) to your advantage for secure defaults (HttpOnly cookies, CSRF protection). Validate on the server, limit what you store on the client, and have a response plan (invalidate sessions, rotate keys) for any discovered vulnerabilities. By following these practices, you significantly reduce the risk of common attacks such as token theft, unauthorized access, or misconfiguration errors.

## Common Issues and Misconfigurations

Finally, let’s address some known issues and pitfalls that developers have encountered with the new Convex Auth system:

* **JWT Issuer Domain (`.convex.site` vs `.convex.cloud`):** A point of confusion is that Convex Auth JWTs list the issuer as your deployment’s `*.convex.site` URL, even though your app might primarily interact with `*.convex.cloud`. This is intentional – Convex’s authentication endpoints (and thus the “issuer” for tokens) reside on the Convex Site domain. In other words, the Convex deployment’s **auth server** is at `https://<your-deployment>.convex.site`. The OpenID Connect endpoints (token exchange, JWKS, etc.) are expected at that domain. So if you inspect a token and see `"iss": "https://<id>.convex.site"`, that is correct. Misconfiguration can happen if one tries to override this domain without understanding the separation. For example, setting the environment variable to a `.convex.cloud` URL in the Convex auth config will not change the token issuer – Convex will still use the actual auth domain. The `auth.config.ts` in Convex often includes a provider configuration like:

  ```ts
  export default {
    providers: [
      { domain: process.env.CONVEX_SITE_URL, applicationID: "convex" }
    ],
  };
  ```

  Here, `CONVEX_SITE_URL` should resolve to the `.convex.site` URL of your deployment (the Convex CLI usually sets this for you). If it’s incorrectly set to a `.convex.cloud` address, the Convex auth server might not function as expected. The bottom line: **use the Convex-provided URLs** as documented. For client connections use `.convex.cloud`, for any references to the auth issuer or direct HTTP calls use `.convex.site`. If you are verifying Convex JWTs in external services, configure the expected issuer to the convex.site URL. This isn’t a security hole but a common source of confusion — recognizing that the Convex “Cloud” URL is for the client (WebSocket) connection and the “Site” URL is for HTTP interactions and token issuance will help you avoid misconfigurations.

* **Environment variables not taking effect:** Another common issue is missing or improperly set environment variables, which can lead to runtime errors. A frequent example is the error: “Missing environment variable `JWT_PRIVATE_KEY`” when trying to sign in users. This typically means the private key was not actually provided to the Convex deployment. Remember that Convex functions run in the Convex cloud environment, not inside your Next.js Node process, so they do *not* read from your Next.js `.env` or Vercel env by default. You must set Convex-specific env vars via the Convex CLI or the Convex dashboard. Double-check in the Convex dashboard’s **Environment Variables** page that `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, and any provider keys are present for the deployment (and do this separately for dev vs prod deployments). If you see this error locally, run the setup again or manually set the env vars with `convex env set`. If deploying, ensure you ran the `--prod` initialization or copied the vars to production. Likewise, if using the Next.js adapter, ensure any required environment variables (like `NEXT_PUBLIC_CONVEX_URL`) are configured in your hosting platform (Vercel, Netlify, etc.). The Convex docs note that the `npx convex deploy` command will try to automatically set the correct Convex URL in your environment when building, but if you override it or use a custom domain, you need to handle that manually.

* **Using the wrong URL for HTTP actions:** This is a specific case of the first point but worth reiterating because it’s a common hiccup. If you attempt to call your Convex HTTP action using the `.convex.cloud` address, it will **not work** (you might get CORS errors or 404). Always use the `<deployment>.convex.site` address for HTTP routes. The Convex dashboard Settings > “URL and Deploy Key” will show two URLs – one ending in convex.cloud (for the client) and one in convex.site (for curl/HTTP). Make sure you pick the correct one for your use case. Convex’s docs explicitly warn to use the `.convex.site` URL for curl/HTTP requests. If you get errors calling an HTTP action, verify the domain and path. Also ensure your route was deployed (check the Convex Dashboard’s Functions view to see if your `http` file endpoints are listed, and no build errors occurred). Deploying updates and checking logs can help diagnose these issues.

* **Middleware or Next.js integration issues:** If you use `@convex-dev/auth/nextjs`, ensure you follow the setup instructions. A common mistake is forgetting to wrap your app in the `ConvexProviderWithAuth` or to provide the `useAuth` hook from Convex Auth to it. This can result in errors like “useAuth() called in static mode” or missing context issues. The solution is usually to wrap your root layout or `_app.js` in the Convex provider with the auth hook, as shown in Convex’s examples. Also, define the middleware `matcher` correctly so it doesn’t run on static assets (Convex docs give a sample matcher to exclude `_next` and static files). If you encounter issues with Next.js and Convex Auth on first page load, it could be because the Next.js server doesn’t have the auth state – using the Next.js integration (which stores a cookie and makes the token available to the server) will resolve this. Always test your protected routes and redirects thoroughly.

* **Third-party auth provider configuration:** If integrating external auth systems (like Clerk, Auth0, etc.) with Convex, ensure the JWT issuer and audience settings align. Convex has guides for these integrations which often involve setting the Convex deployment URL as an issuer or adding Convex’s JWKS to the provider. For instance, when using Clerk with Convex, you create a JWT template in Clerk’s dashboard specifically for Convex, set the **Issuer** to your Convex deployment URL (convex.site), and configure Convex to trust that issuer. A misconfiguration here (like wrong issuer URL, or forgetting to deploy Convex with the appropriate `auth.config.ts` settings) can result in Convex rejecting tokens or users not being recognized. Always follow the official Convex integration guides and double-check environment variable names (they can differ: e.g., Clerk might require `CLERK_JWT_TEMPLATE_ID` or similar in Convex). These specifics go beyond Convex Auth alone but are worth noting if you expand your auth to other providers.

In closing, the **new Convex Auth system** is powerful and convenient for Next.js apps, providing a seamless full-stack auth experience. By carefully integrating it with Convex client functions and HTTP actions, following security best practices, and avoiding known misconfigurations, you can ensure your authentication is both robust and secure. Always refer to Convex’s official documentation and community resources for the latest tips – Convex’s team frequently publishes updates and is active on GitHub/Discord to help troubleshoot issues. With the guidelines above, you’ll be well on your way to implementing Convex Auth in Next.js with confidence and security.

**Sources:**

* Convex Documentation – *Auth in Functions*, *Convex & HTTP Actions*, *Convex Auth Manual Setup*, *Authorization (Convex Auth)*, *Security in Convex Auth*, *Next.js Convex Auth Integration*, and *Production Deployment*.
* Convex GitHub Issues – JWT configuration and environment setup.
* Convex community Q\&A – Clarification on Convex Auth domains and URLs.
