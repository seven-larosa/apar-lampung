// Vendored from @openai/sites-vite-plugin 0.2.0 (openai/sites#9).
// See sites-vite-plugin.LICENSE for the upstream MIT license.
import { access, cp, mkdir, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const localUserId = "local_seedy";
const localEmail = "seedy@sites.test";
const localFullName = "Seedy";
const localAccounts = {
  owner: { userId: "local_owner", email: "sevenhexclick1@gmail.com", fullName: "Pemilik" },
  admin: { userId: "local_admin", email: "admin@apar-lampung.test", fullName: "Admin / Kasir" },
  technician: { userId: "local_technician", email: "spite0tram@icloud.com", fullName: "Teknisi" },
} as const;
const localCookieName = "__sites_local_auth";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const localAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const authPaths = new Set([
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
]);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function sites({ mockAuth = true } = {}): Plugin {
  let root = process.cwd();
  let command: "build" | "serve" = "build";

  return {
    name: "sites",
    configResolved(config) {
      root = config.root;
      command = config.command;
    },
    configureServer(server) {
      if (!mockAuth) return;
      const secure = Boolean(server.config.server.https);

      server.config.logger.info("Sites local sign-in: open /signin-with-chatgpt");
      server.middlewares.use((request, response, next) => {
        for (const name of Object.keys(request.headers)) {
          if (name.startsWith("oai-authenticated-user-")) {
            removeHeader(request, name);
          }
        }

        let authority: URL;
        let url: URL;
        try {
          authority = new URL(
            `${secure ? "https" : "http"}://${request.headers.host}`,
          );
          url = new URL(request.url ?? "/", authority);
        } catch {
          if (authPaths.has((request.url ?? "/").split("?")[0])) {
            respond(response, 403);
          } else {
            next();
          }
          return;
        }

        const hostname = authority.hostname
          .replace(/^\[|\]$/g, "")
          .toLowerCase();
        if (
          !localHosts.has(hostname) ||
          !localAddresses.has(request.socket.remoteAddress ?? "") ||
          url.origin !== authority.origin
        ) {
          if (authPaths.has(url.pathname)) respond(response, 403);
          else next();
          return;
        }

        const cookies = (request.headers.cookie ?? "")
          .split(";")
          .map((cookie) => cookie.trim())
          .filter(Boolean);
        const signInCookies = cookies
          .filter((cookie) => cookie.startsWith(`${localCookieName}=`))
          .map((cookie) => cookie.slice(localCookieName.length + 1));
        const applicationCookies = cookies.filter(
          (cookie) => !cookie.startsWith(`${localCookieName}=`),
        );
        if (applicationCookies.length !== cookies.length) {
          removeHeader(request, "cookie");
          if (applicationCookies.length) {
            setHeader(request, "cookie", applicationCookies.join("; "));
          }
        }

        if (url.pathname === "/callback") {
          respond(response, 501);
          return;
        }

        const signIn = url.pathname === "/signin-with-chatgpt";
        const signOut = url.pathname === "/signout-with-chatgpt";
        if (!signIn && !signOut) {
          const account = signInCookies[0];
          const identity = account === "1"
            ? { userId: localUserId, email: localEmail, fullName: localFullName }
            : localAccounts[account as keyof typeof localAccounts];
          if (signInCookies.length === 1 && identity) {
            setHeader(request, "oai-authenticated-user-id", identity.userId);
            setHeader(request, "oai-authenticated-user-email", identity.email);
            setHeader(
              request,
              "oai-authenticated-user-full-name",
              identity.fullName,
            );
            setHeader(
              request,
              "oai-authenticated-user-full-name-encoding",
              "percent-encoded-utf-8",
            );
          }
          next();
          return;
        }

        if (
          (request.headers.origin && request.headers.origin !== url.origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        ) {
          respond(response, 403);
          return;
        }

        if (
          request.headers["next-router-prefetch"] !== undefined ||
          request.headers["x-middleware-prefetch"] === "1" ||
          [request.headers.purpose, request.headers["sec-purpose"]].some(
            (value) =>
              typeof value === "string" &&
              value
                .split(/[;,]/)
                .some((part) => part.trim().toLowerCase() === "prefetch"),
          )
        ) {
          respond(response, 204);
          return;
        }

        if (
          request.method !== "GET" &&
          (!signOut || request.method !== "POST")
        ) {
          response.setHeader("Allow", signIn ? "GET" : "GET, POST");
          respond(response, 405);
          return;
        }

        const returnTo = safeReturn(url.searchParams.get("return_to"));
        const account = url.searchParams.get("account");
        if (signIn && !(account && Object.hasOwn(localAccounts, account))) {
          response.statusCode = 200;
          response.setHeader("Cache-Control", "private, no-store");
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(localLoginPage(returnTo));
          return;
        }

        response.statusCode = request.method === "POST" ? 303 : 302;
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader(
          "Location",
          returnTo,
        );
        response.setHeader(
          "Set-Cookie",
          `${localCookieName}=${signIn ? account : ""}; Path=/; ${
            signOut ? "Max-Age=0; " : ""
          }HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
        );
        response.end();
      });
    },
    async closeBundle() {
      if (command !== "build") return;

      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");
      const drizzleSource = resolve(root, "drizzle");

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(outputDirectory, "drizzle"), {
          recursive: true,
        });
      }
    },
  };
}

function localLoginPage(returnTo: string): string {
  const destination = encodeURIComponent(returnTo);
  return `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Masuk · Apar Lampung</title><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070c14;color:#eaf3fc;font:16px Arial,sans-serif;padding:24px}
    main{width:min(100%,430px);background:#101c2b;border:1px solid #29415a;border-radius:16px;padding:32px;box-shadow:0 24px 64px #0008}
    .brand{color:#69c9f4;font-size:12px;font-weight:800;letter-spacing:.16em}h1{margin:18px 0 8px;font-size:30px;letter-spacing:-.04em}p{color:#a8bdd2;line-height:1.5;font-size:14px}
    a{display:block;text-decoration:none;border:1px solid #34516c;border-radius:8px;color:#eaf3fc;padding:14px 16px;margin-top:12px;background:#162b40;font-weight:700}a:hover,a:focus-visible{background:#1d3d59;border-color:#5dbbeb;outline:none}a.primary{background:#c92f32;border-color:#e44749;color:white}a.primary:hover,a.primary:focus-visible{background:#a8272b}
    small{display:block;color:#8da5ba;margin-top:22px;line-height:1.5}
  </style><main><div class="brand">AL. &nbsp; APAR LAMPUNG</div><h1>Masuk ke dashboard</h1><p>Pilih peran untuk mencoba aplikasi di komputer ini.</p><a class="primary" href="/signin-with-chatgpt?return_to=${destination}&account=owner">Masuk sebagai Pemilik</a><a href="/signin-with-chatgpt?return_to=${destination}&account=admin">Masuk sebagai Admin / Kasir</a><a href="/signin-with-chatgpt?return_to=${destination}&account=technician">Masuk sebagai Teknisi</a><small>Ini login simulasi khusus localhost, tanpa password. Situs online menggunakan login ChatGPT.</small></main></html>`;
}

function removeHeader(request: IncomingMessage, name: string): void {
  delete request.headers[name];
  for (let index = request.rawHeaders.length - 2; index >= 0; index -= 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      request.rawHeaders.splice(index, 2);
    }
  }
}

function setHeader(
  request: IncomingMessage,
  name: string,
  value: string,
): void {
  removeHeader(request, name);
  request.headers[name] = value;
  request.rawHeaders.push(name, value);
}

function respond(response: ServerResponse, status: number): void {
  response.statusCode = status;
  response.setHeader("Cache-Control", "private, no-store");
  response.end();
}

function safeReturn(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost" || authPaths.has(url.pathname)) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
