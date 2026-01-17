import Docker from 'dockerode';
import type { ProjectsRepository } from '../repositories/projects.ts';
import type { SessionsRepository } from '../repositories/sessions.ts';
import type { Session, Project } from '../db/types.ts';

export interface ServiceUrls {
  cui: string;
  mastra: string;
  astro: string | null;
  vscode: string;
}

export interface CreateSandboxInput {
  projectId: string;
  artifactName: string;
  environment: string;
}

export interface CreateSandboxResult {
  session: Session;
  urls: ServiceUrls;
}

export interface ResumeSandboxResult {
  session: Session;
  urls: ServiceUrls;
}

export interface SandboxServiceOptions {
  projectsRepo: ProjectsRepository;
  sessionsRepo: SessionsRepository;
  dockerEnabled?: boolean;
}

export class SessionAlreadyExistsError extends Error {
  constructor(
    public existingSessionId: string,
    message: string
  ) {
    super(message);
    this.name = 'SessionAlreadyExistsError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class EnvironmentNotFoundError extends Error {
  constructor(projectId: string, envName: string) {
    super(`Environment not found: ${envName} in project ${projectId}`);
    this.name = 'EnvironmentNotFoundError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionNotActiveError extends Error {
  constructor(sessionId: string) {
    super(`Session is not active: ${sessionId}`);
    this.name = 'SessionNotActiveError';
  }
}

export class SessionAlreadyActiveError extends Error {
  constructor(sessionId: string) {
    super(`Session is already active: ${sessionId}`);
    this.name = 'SessionAlreadyActiveError';
  }
}

export class SandboxService {
  private projectsRepo: ProjectsRepository;
  private sessionsRepo: SessionsRepository;
  private dockerEnabled: boolean;
  private docker: Docker;

  // Default ports for services
  private static readonly PORTS = {
    cui: 3001,
    mastra: 4111,
    astro: 4321,
    vscode: 8080,
  };

  // Container image names (built from sandbox/ Dockerfiles)
  private static readonly IMAGES = {
    cui: 'mastragen-001-core-platform-foundation-cui',
    mastra: 'mastragen-001-core-platform-foundation-mastra',
    astro: 'mastragen-001-core-platform-foundation-astro',
    vscode: 'mastragen-001-core-platform-foundation-code-server',
  };

  // Cache for session -> project mapping (for URL generation)
  private sessionProjectCache: Map<string, Project> = new Map();

  constructor(options: SandboxServiceOptions) {
    this.projectsRepo = options.projectsRepo;
    this.sessionsRepo = options.sessionsRepo;
    this.dockerEnabled = options.dockerEnabled ?? true;
    this.docker = new Docker();
  }

  /**
   * Creates a new sandbox session.
   */
  async create(input: CreateSandboxInput): Promise<CreateSandboxResult> {
    const { projectId, artifactName, environment } = input;

    // Validate project exists
    const project = await this.projectsRepo.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Validate environment exists
    const env = await this.projectsRepo.findEnvironmentByName(projectId, environment);
    if (!env) {
      throw new EnvironmentNotFoundError(projectId, environment);
    }

    // Check for existing session
    const existingSession = await this.sessionsRepo.findByProjectAndName(projectId, artifactName);
    if (existingSession) {
      throw new SessionAlreadyExistsError(
        existingSession.id,
        `Session already exists for project ${projectId} with artifact name ${artifactName}`
      );
    }

    // Generate workspace volume name
    const workspaceVolume = this.generateWorkspaceVolumeName(projectId, artifactName);

    // Create session in database
    const session = await this.sessionsRepo.create({
      project_id: projectId,
      artifact_name: artifactName,
      environment,
      workspace_volume: workspaceVolume,
      // container_id will be set when Docker containers are started
    });

    // Cache project for URL generation
    this.sessionProjectCache.set(session.id, project);

    // Start Docker containers if enabled
    console.log(`[SandboxService] create() - dockerEnabled: ${this.dockerEnabled}`);
    if (this.dockerEnabled) {
      console.log(`[SandboxService] create() - calling startContainers...`);
      try {
        await this.startContainers(session, project, env.env_vars);
        console.log(`[SandboxService] create() - startContainers completed`);
      } catch (err) {
        console.error(`[SandboxService] create() - startContainers failed:`, err);
        throw err;
      }
    } else {
      console.log(`[SandboxService] create() - Docker disabled, skipping container creation`);
    }

    return {
      session,
      urls: this.getServiceUrls(session.id, project),
    };
  }

  /**
   * Gets service URLs for a session.
   */
  getServiceUrls(sessionId: string, project?: Project): ServiceUrls {
    const cachedProject = project ?? this.sessionProjectCache.get(sessionId);

    return {
      cui: `http://localhost:${SandboxService.PORTS.cui}`,
      mastra: `http://localhost:${SandboxService.PORTS.mastra}`,
      astro: cachedProject?.ui_sandbox_path ? `http://localhost:${SandboxService.PORTS.astro}` : null,
      vscode: `http://localhost:${SandboxService.PORTS.vscode}`,
    };
  }

  /**
   * Generates a consistent workspace volume name for a session.
   */
  generateWorkspaceVolumeName(projectId: string, artifactName: string): string {
    return `mastragen-${projectId}-${artifactName}`;
  }

  /**
   * Suspends an active session.
   */
  async suspend(sessionId: string): Promise<Session> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state !== 'active') {
      throw new SessionNotActiveError(sessionId);
    }

    // Stop Docker containers if enabled
    if (this.dockerEnabled) {
      await this.stopContainers(session);
    }

    // Update session state
    const updatedSession = await this.sessionsRepo.updateState(sessionId, 'suspended');
    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    return updatedSession;
  }

  /**
   * Resumes a suspended session.
   */
  async resume(sessionId: string): Promise<ResumeSandboxResult> {
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.state === 'active') {
      throw new SessionAlreadyActiveError(sessionId);
    }

    // Get project for container startup
    const project = await this.projectsRepo.findById(session.project_id);
    if (!project) {
      throw new ProjectNotFoundError(session.project_id);
    }

    // Get environment for container startup
    const env = await this.projectsRepo.findEnvironmentByName(
      session.project_id,
      session.environment
    );

    // Update session state
    const updatedSession = await this.sessionsRepo.updateState(sessionId, 'active');
    if (!updatedSession) {
      throw new SessionNotFoundError(sessionId);
    }

    // Cache project for URL generation
    this.sessionProjectCache.set(sessionId, project);

    // Start Docker containers if enabled
    if (this.dockerEnabled && env) {
      await this.startContainers(updatedSession, project, env.env_vars);
    }

    return {
      session: updatedSession,
      urls: this.getServiceUrls(sessionId, project),
    };
  }

  /**
   * Starts Docker containers for a session.
   */
  private async startContainers(
    session: Session,
    project: Project,
    envVars: string
  ): Promise<void> {
    console.log(`[SandboxService] startContainers called for session ${session.id}`);
    console.log(`[SandboxService] dockerEnabled: ${this.dockerEnabled}`);

    const volumeName = session.workspace_volume ?? this.generateWorkspaceVolumeName(session.project_id, session.artifact_name);
    console.log(`[SandboxService] Using volume: ${volumeName}`);

    // Ensure volume exists
    try {
      console.log(`[SandboxService] Creating volume...`);
      await this.docker.createVolume({ Name: volumeName });
      console.log(`[SandboxService] Volume created successfully`);
    } catch (err: unknown) {
      console.log(`[SandboxService] Volume creation error:`, err);
      // Volume may already exist, which is fine
      if (!(err instanceof Error) || !err.message.includes('already exists')) {
        throw err;
      }
      console.log(`[SandboxService] Volume already exists, continuing...`);
    }

    // Parse environment variables from JSON string
    let parsedEnvVars: Record<string, string> = {};
    try {
      parsedEnvVars = JSON.parse(envVars || '{}');
    } catch {
      // If parsing fails, use empty object
    }

    // Build environment array for containers
    const baseEnv = [
      `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
      ...Object.entries(parsedEnvVars).map(([k, v]) => `${k}=${v}`),
    ];

    // Container configurations
    const containers = [
      {
        name: `${session.id}-cui`,
        image: SandboxService.IMAGES.cui,
        port: SandboxService.PORTS.cui,
        env: baseEnv,
      },
      {
        name: `${session.id}-mastra`,
        image: SandboxService.IMAGES.mastra,
        port: SandboxService.PORTS.mastra,
        env: baseEnv,
      },
      {
        name: `${session.id}-vscode`,
        image: SandboxService.IMAGES.vscode,
        port: SandboxService.PORTS.vscode,
        env: baseEnv,
      },
    ];

    // Add astro container if project has UI sandbox
    if (project.ui_sandbox_path) {
      containers.push({
        name: `${session.id}-astro`,
        image: SandboxService.IMAGES.astro,
        port: SandboxService.PORTS.astro,
        env: baseEnv,
      });
    }

    // Start containers in parallel
    console.log(`[SandboxService] Starting ${containers.length} containers...`);
    const containerIds: string[] = [];
    await Promise.all(
      containers.map(async (config) => {
        try {
          console.log(`[SandboxService] Creating container: ${config.name} (image: ${config.image}, port: ${config.port})`);
          const container = await this.docker.createContainer({
            name: config.name,
            Image: config.image,
            Env: config.env,
            HostConfig: {
              Binds: [`${volumeName}:/workspace`],
              PortBindings: {
                [`${config.port}/tcp`]: [{ HostPort: String(config.port) }],
              },
            },
            ExposedPorts: {
              [`${config.port}/tcp`]: {},
            },
          });
          console.log(`[SandboxService] Container created: ${container.id}, starting...`);
          await container.start();
          console.log(`[SandboxService] Container started: ${config.name}`);
          containerIds.push(container.id);
        } catch (err) {
          console.error(`[SandboxService] Error creating/starting container ${config.name}:`, err);
          throw err;
        }
      })
    );

    // Store container IDs in session (comma-separated)
    console.log(`[SandboxService] All containers started, IDs: ${containerIds.join(', ')}`);
    await this.sessionsRepo.update(session.id, {
      container_id: containerIds.join(','),
    });
    console.log(`[SandboxService] Session updated with container IDs`);
  }

  /**
   * Stops Docker containers for a session.
   */
  private async stopContainers(session: Session): Promise<void> {
    if (!session.container_id) {
      return;
    }

    const containerIds = session.container_id.split(',');

    await Promise.all(
      containerIds.map(async (containerId) => {
        try {
          const container = this.docker.getContainer(containerId.trim());
          await container.stop();
          await container.remove();
        } catch (err: unknown) {
          // Container may already be stopped or removed
          if (err instanceof Error && !err.message.includes('not running') && !err.message.includes('No such container')) {
            throw err;
          }
        }
      })
    );
  }
}
