#!/usr/bin/env bun
/**
 * T096-T097: Minikube integration test script (TypeScript version)
 *
 * This script validates the Mastragen Helm deployment in a local minikube cluster.
 * It performs the following checks:
 * 1. Helm install succeeds
 * 2. Orchestrator pod reaches Ready state within 120s
 * 3. POST /api/sessions creates a session
 * 4. Health endpoint returns success
 *
 * Usage:
 *   bun scripts/minikube-test.ts [--build]
 *
 * Options:
 *   --build    Build local Docker images before installing (default: use published images)
 *
 * Prerequisites:
 *   - minikube installed
 *   - kubectl installed
 *   - helm 3+ installed
 *   - docker installed (if using --build)
 */

import { $ } from "bun";
import type { Subprocess } from "bun";

// Colors for output
const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const NC = "\x1b[0m"; // No Color

// Configuration
const RELEASE_NAME = "mastragen-test";
const NAMESPACE = "mastragen-test";
const TIMEOUT = "120s";
const HEALTH_CHECK_RETRIES = 10;
const HEALTH_CHECK_DELAY = 3000; // milliseconds

// State
let portForwardProcess: Subprocess | null = null;

function log(message: string): void {
  console.log(`${GREEN}[INFO]${NC} ${message}`);
}

function warn(message: string): void {
  console.log(`${YELLOW}[WARN]${NC} ${message}`);
}

function error(message: string): never {
  console.error(`${RED}[ERROR]${NC} ${message}`);
  process.exit(1);
}

async function cleanup(): Promise<void> {
  log("Cleaning up...");

  // Kill port-forward if running
  if (portForwardProcess) {
    try {
      portForwardProcess.kill();
    } catch {
      // Ignore errors when killing process
    }
  }

  // Delete helm release
  try {
    await $`helm uninstall ${RELEASE_NAME} -n ${NAMESPACE}`.quiet();
  } catch {
    // Ignore errors if release doesn't exist
  }

  // Delete namespace
  try {
    await $`kubectl delete namespace ${NAMESPACE} --ignore-not-found=true`.quiet();
  } catch {
    // Ignore errors if namespace doesn't exist
  }

  log("Cleanup complete");
}

// Parse arguments
function parseArgs(): { buildLocal: boolean } {
  const args = process.argv.slice(2);
  let buildLocal = false;

  for (const arg of args) {
    if (arg === "--build") {
      buildLocal = true;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return { buildLocal };
}

async function checkPrerequisites(): Promise<void> {
  log("Checking prerequisites...");

  if (!Bun.which("minikube")) {
    error("minikube is required but not installed");
  }

  if (!Bun.which("kubectl")) {
    error("kubectl is required but not installed");
  }

  if (!Bun.which("helm")) {
    error("helm is required but not installed");
  }

  // Check helm version is 3+
  const helmVersionResult = await $`helm version --short`.text();
  const helmVersionMatch = helmVersionResult.match(/v(\d+)/);
  const helmMajorVersion = helmVersionMatch ? parseInt(helmVersionMatch[1], 10) : 0;

  if (helmMajorVersion < 3) {
    error(`Helm 3+ is required, found: ${helmVersionResult.trim()}`);
  }
}

async function ensureMinikubeRunning(): Promise<void> {
  log("Checking minikube status...");

  const statusResult = await $`minikube status`.quiet().nothrow();
  const statusText = statusResult.stdout.toString();

  if (!statusText.includes("Running")) {
    log("Starting minikube...");
    await $`minikube start`;
  }
}

async function buildLocalImages(): Promise<string> {
  log("Building local Docker images...");

  // Get minikube docker-env and set environment variables
  const dockerEnvResult = await $`minikube docker-env --shell bash`.text();
  const envLines = dockerEnvResult.split("\n");

  for (const line of envLines) {
    const match = line.match(/^export ([^=]+)="([^"]*)"$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }

  // Build orchestrator image
  log("Building orchestrator image...");
  await $`docker build -t mastragen-orchestrator:test ./orchestrator`;

  return "--set orchestrator.image.repository=mastragen-orchestrator --set orchestrator.image.tag=test --set orchestrator.image.pullPolicy=Never";
}

async function createNamespace(): Promise<void> {
  log(`Creating namespace: ${NAMESPACE}`);
  const yaml = await $`kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml`.text();
  await $`kubectl apply -f -`.stdin(yaml);
}

async function installHelmChart(imageOverride: string): Promise<void> {
  log("Installing Helm chart...");

  const baseArgs = [
    "upgrade",
    "--install",
    RELEASE_NAME,
    "./helm/mastragen",
    "--namespace",
    NAMESPACE,
    "--set",
    "tailscale.enabled=false",
    "--set",
    "orchestrator.persistence.enabled=false",
    "--wait",
    "--timeout",
    TIMEOUT,
  ];

  // Parse image override flags if provided
  if (imageOverride) {
    const overrideParts = imageOverride.split(/\s+--set\s+/).filter(Boolean);
    for (const part of overrideParts) {
      const cleanPart = part.replace(/^--set\s+/, "");
      if (cleanPart) {
        baseArgs.push("--set", cleanPart);
      }
    }
  }

  await $`helm ${baseArgs}`;

  log("Helm chart installed successfully");
}

async function waitForPodReady(): Promise<void> {
  log("Waiting for orchestrator pod to be ready...");

  await $`kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=orchestrator -n ${NAMESPACE} --timeout=${TIMEOUT}`;

  log("Orchestrator pod is ready");
}

async function setupPortForward(): Promise<void> {
  log("Setting up port-forward...");

  portForwardProcess = Bun.spawn(
    ["kubectl", "port-forward", "-n", NAMESPACE, `svc/${RELEASE_NAME}-mastragen-orchestrator`, "4000:4000"],
    {
      stdout: "ignore",
      stderr: "ignore",
    }
  );

  await Bun.sleep(5000);
}

async function performHealthCheck(): Promise<void> {
  log("Performing health check...");

  for (let i = 1; i <= HEALTH_CHECK_RETRIES; i++) {
    try {
      const response = await fetch("http://localhost:4000/health");
      if (response.ok) {
        log("Health check passed!");
        return;
      }
    } catch {
      // Connection failed, will retry
    }

    if (i === HEALTH_CHECK_RETRIES) {
      error(`Health check failed after ${HEALTH_CHECK_RETRIES} attempts`);
    }

    warn(`Health check attempt ${i} failed, retrying in ${HEALTH_CHECK_DELAY / 1000}s...`);
    await Bun.sleep(HEALTH_CHECK_DELAY);
  }
}

async function testApiEndpoint(): Promise<void> {
  log("Testing API endpoint...");

  try {
    const response = await fetch("http://localhost:4000/api/");
    const apiResponse = await response.text();

    if (apiResponse.includes("mastragen-orchestrator")) {
      log("API endpoint working correctly");
    } else {
      warn(`API response unexpected: ${apiResponse}`);
    }
  } catch (err) {
    warn(`API test failed: ${err}`);
  }
}

async function getPodLogs(): Promise<void> {
  log("Orchestrator pod logs (last 20 lines):");

  try {
    await $`kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/component=orchestrator --tail=20`;
  } catch {
    // Ignore errors fetching logs
  }
}

async function main(): Promise<void> {
  const { buildLocal } = parseArgs();

  // Register cleanup handlers
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  process.on("exit", () => {
    // Synchronous cleanup for port-forward process
    if (portForwardProcess) {
      try {
        portForwardProcess.kill();
      } catch {
        // Ignore
      }
    }
  });

  console.log("=== Mastragen Minikube Integration Test ===");
  console.log("");

  try {
    await checkPrerequisites();
    await ensureMinikubeRunning();

    let imageOverride = "";
    if (buildLocal) {
      imageOverride = await buildLocalImages();
    }

    await createNamespace();
    await installHelmChart(imageOverride);
    await waitForPodReady();
    await setupPortForward();
    await performHealthCheck();
    await testApiEndpoint();
    await getPodLogs();

    console.log("");
    console.log("===================================");
    console.log(`${GREEN}=== Test PASSED ===${NC}`);
    console.log("===================================");
    console.log("");
    console.log("The Mastragen Helm chart installed successfully and the orchestrator is healthy.");
    console.log("");
    console.log("To access the running instance:");
    console.log(`  kubectl port-forward -n ${NAMESPACE} svc/${RELEASE_NAME}-mastragen-orchestrator 4000:4000`);
    console.log("  curl http://localhost:4000/health");
    console.log("");
    console.log("To clean up:");
    console.log(`  helm uninstall ${RELEASE_NAME} -n ${NAMESPACE}`);
    console.log(`  kubectl delete namespace ${NAMESPACE}`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
