// Test project fixtures
export const testProjects = {
  withConfig: {
    id: 'proj-with-config-001',
    name: 'Project with cui Config',
    github_repo: 'org/project-with-config',
    default_branch: 'main',
    branch_prefix: 'feature/',
    mastra_path: 'src/mastra',
    ui_sandbox_path: 'src/ui',
  },
  minimal: {
    id: 'proj-minimal-001',
    name: 'Minimal Project',
    github_repo: 'org/minimal-project',
    default_branch: 'main',
    branch_prefix: null,
    mastra_path: null,
    ui_sandbox_path: null,
  },
};

// Test cui config fixtures
export const testCuiConfigs = {
  full: {
    id: 'cui-config-full-001',
    project_id: testProjects.withConfig.id,
    mcp_servers: JSON.stringify({
      'test-server': {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/test-server'],
        env: { API_KEY: 'test-key' },
      },
    }),
    claude_md: '# Test Project\n\nThis is a test CLAUDE.md file.',
    auto_approve_file_patterns: JSON.stringify(['*.ts', '*.tsx']),
    auto_approve_mcp_tools: JSON.stringify(['read_file', 'write_file']),
    auto_approve_bash_commands: JSON.stringify(['npm test', 'npm run build']),
  },
  empty: {
    id: 'cui-config-empty-001',
    project_id: testProjects.minimal.id,
    mcp_servers: '{}',
    claude_md: null,
    auto_approve_file_patterns: '[]',
    auto_approve_mcp_tools: '[]',
    auto_approve_bash_commands: '[]',
  },
};

// Test commands fixtures
export const testCommands = {
  deploy: {
    id: 'cmd-deploy-001',
    project_id: testProjects.withConfig.id,
    name: 'deploy',
    description: 'Deploy the application to staging',
    content: `# /deploy

Deploy the current changes to the staging environment.

## Steps
1. Run tests
2. Build the application
3. Deploy to staging
`,
  },
  test: {
    id: 'cmd-test-001',
    project_id: testProjects.withConfig.id,
    name: 'test',
    description: 'Run the test suite',
    content: `# /test

Run the full test suite.

\`\`\`bash
npm test
\`\`\`
`,
  },
};

// Test skills fixtures
export const testSkills = {
  coding: {
    id: 'skill-coding-001',
    project_id: testProjects.withConfig.id,
    name: 'coding-standards',
    description: 'Project coding standards and conventions',
    content: `# Coding Standards

## TypeScript
- Use strict mode
- Prefer interfaces over types
- Use explicit return types

## React
- Use functional components
- Use hooks for state management
`,
  },
};
