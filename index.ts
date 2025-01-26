import { Hono } from "hono";
import Repo from "./repo";
import fs from "fs";
import path from "path";
import os from "os";
import type { Context } from "hono";
import { MemoryCache } from "./cache";
import type { Cache } from "./cache";

interface AppConfig {
  REPO_URI: string;
  CLONE_PATH: string;
  CACHE_TTL: number;
}

// Custom context type
type AppContext = Context<{ Variables: { repo: Repo } }>;

// Create Hono app with proper typing
const app = new Hono<{ Variables: { repo: Repo } }>();

// Middleware for repo initialization
app.use("*", async (c, next) => {
  if (!c.get("repo")) {
    try {
      const config = getConfig();
      const repo = await initializeRepo(config);
      c.set("repo", repo);
    } catch (error) {
      return c.json(
        { error: "Repository initialization failed", details: error.message },
        500
      );
    }
  }
  await next();
});

// Configuration loader
function getConfig(): AppConfig {
  return {
    REPO_URI: process.env.REPO_URI || createTempRepo(),
    CLONE_PATH:
      process.env.CLONE_PATH ||
      fs.mkdtempSync(path.join(os.tmpdir(), "repo-clone-")),
    CACHE_TTL: parseInt(process.env.CACHE_TTL || "300"), // 5 minutes default
  };
}
// Temporary repo creation for development
function createTempRepo(): string {
  const tempRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "temp-repo-"));
  const git = simpleGit(tempRepoPath);

  fs.writeFileSync(path.join(tempRepoPath, "README.md"), "# Temp Repo");
  git.init();
  git.add(".");
  git.commit("Initial commit");

  return `file://${tempRepoPath}`;
}

// Repo initialization
async function initializeRepo(config: AppConfig): Promise<Repo> {
  const cache = new MemoryCache(config.CACHE_TTL);
  const repo = new Repo(config.REPO_URI, config.CLONE_PATH, cache);
  await repo.init();
  return repo;
}

// Commit hash endpoint
app.get("/commit-hash/:version", async (c: AppContext) => {
  const version = c.req.param("version");
  const repo = c.get("repo");

  try {
    const commitHash = await repo.getCommitHash(version);
    return c.json({ version, commitHash });
  } catch (error) {
    return c.json(
      { error: "Failed to get commit hash", details: error.message },
      400
    );
  }
});

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Error handling middleware
app.onError((err, c) => {
  console.error("Application error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
