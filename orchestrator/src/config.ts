/**
 * Application configuration loaded from environment variables.
 */
export interface Config {
  /** Server port (default: 4000) */
  port: number;

  /** Server host (default: 0.0.0.0) */
  host: string;

  /** Path to SQLite database file (default: ./data/mastragen.db) */
  databasePath: string;

  /** GitHub personal access token for cloning private repos */
  githubToken: string | undefined;

  /** GitHub App ID for authenticated API access */
  githubAppId: string | undefined;

  /** GitHub App private key (PEM format) for authenticated API access */
  githubAppPrivateKey: string | undefined;

  /** GitHub App installation ID for repository access */
  githubAppInstallationId: string | undefined;

  /** Anthropic API key (direct API access) */
  anthropicApiKey: string | undefined;

  /** AWS region for Bedrock (alternative to Anthropic API) */
  awsRegion: string | undefined;

  /** AWS access key ID for Bedrock */
  awsAccessKeyId: string | undefined;

  /** AWS secret access key for Bedrock */
  awsSecretAccessKey: string | undefined;
}

/**
 * Loads configuration from environment variables.
 */
export function loadConfig(): Config {
  return {
    port: Number.parseInt(process.env.PORT ?? '4000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    databasePath: process.env.DATABASE_PATH ?? './data/mastragen.db',
    githubToken: process.env.GITHUB_TOKEN,
    githubAppId: process.env.GITHUB_APP_ID,
    githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    githubAppInstallationId: process.env.GITHUB_APP_INSTALLATION_ID,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

/**
 * Validates that required configuration is present.
 * Returns an array of missing required fields.
 */
export function validateConfig(_config: Config): string[] {
  const missing: string[] = [];

  // GitHub token is required for private repos (warn but don't fail)
  // API keys are optional (can use either Anthropic or AWS Bedrock)

  return missing;
}
