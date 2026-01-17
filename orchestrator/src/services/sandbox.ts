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

export class SandboxService {
  private projectsRepo: ProjectsRepository;
  private sessionsRepo: SessionsRepository;
  private dockerEnabled: boolean;

  // Default ports for services
  private static readonly PORTS = {
    cui: 3001,
    mastra: 4111,
    astro: 4321,
    vscode: 8080,
  };

  // Cache for session -> project mapping (for URL generation)
  private sessionProjectCache: Map<string, Project> = new Map();

  constructor(options: SandboxServiceOptions) {
    this.projectsRepo = options.projectsRepo;
    this.sessionsRepo = options.sessionsRepo;
    this.dockerEnabled = options.dockerEnabled ?? true;
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
    if (this.dockerEnabled) {
      await this.startContainers(session, project, env.env_vars);
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
   * Starts Docker containers for a session.
   * This is a placeholder - actual Docker integration will be added.
   */
  private async startContainers(
    _session: Session,
    _project: Project,
    _envVars: string
  ): Promise<void> {
    // Docker container management will be implemented here
    // For now, this is a placeholder
  }
}
