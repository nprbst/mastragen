/**
 * T096: Session PR service
 *
 * Handles creating pull requests from sessions:
 * - Push current branch to remote
 * - Create PR via GitHub API
 * - Return PR URL
 */

interface SandboxClient {
  exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

interface CreatePrInput {
  sessionId: string;
  title: string;
  body: string;
  repo: string;
  base: string;
  accessToken: string;
}

interface PrResult {
  url: string;
  number: number;
  branch: string;
}

export class SessionPrService {
  constructor(private sandboxClient: SandboxClient) {}

  /**
   * Create a pull request from the current session branch.
   */
  async createPr(input: CreatePrInput): Promise<PrResult> {
    // Get current branch
    const branchResult = await this.sandboxClient.exec('git branch --show-current');
    const branch = branchResult.stdout.trim();

    // Push to remote
    const pushResult = await this.sandboxClient.exec(`git push -u origin ${branch}`);
    if (pushResult.exitCode !== 0) {
      throw new Error(`Failed to push: ${pushResult.stderr}`);
    }

    // Create PR via GitHub API
    const response = await fetch(`https://api.github.com/repos/${input.repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: branch,
        base: input.base,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as {
        message?: string;
        errors?: { message: string }[];
      };
      const errorMessage =
        errorData.errors?.[0]?.message || errorData.message || 'Failed to create PR';
      throw new Error(errorMessage);
    }

    const prData = (await response.json()) as { html_url: string; number: number };

    return {
      url: prData.html_url,
      number: prData.number,
      branch,
    };
  }
}
