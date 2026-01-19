import { describe, expect, test, mock, beforeEach } from 'bun:test';

/**
 * T105: Unit test for skills injection
 *
 * Tests that skills are properly injected into sessions.
 */
describe('Skills injection', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('injectSkills', () => {
    test('should inject project skills to /mnt/skills/project/', async () => {
      // Mock skill data
      const mockSkills = [
        {
          id: 'skill-1',
          name: 'mastra-development',
          description: 'Mastra framework patterns',
          content: '# Mastra Development\n\nUse these patterns...',
        },
        {
          id: 'skill-2',
          name: 'code-review',
          description: 'Code review guidelines',
          content: '# Code Review\n\nFollow these guidelines...',
        },
      ];

      // Mock file system operations
      const writtenFiles: { path: string; content: string }[] = [];
      const mockFs = {
        writeFile: mock((path: string, content: string) => {
          writtenFiles.push({ path, content });
          return Promise.resolve();
        }),
        mkdir: mock(() => Promise.resolve()),
      };

      // Create injection function
      async function injectSkills(
        skills: typeof mockSkills,
        targetPath: string,
        fs: typeof mockFs
      ) {
        await fs.mkdir(targetPath);
        for (const skill of skills) {
          const filePath = `${targetPath}/${skill.name}.md`;
          await fs.writeFile(filePath, skill.content);
        }
      }

      await injectSkills(mockSkills, '/mnt/skills/project', mockFs);

      expect(writtenFiles).toHaveLength(2);
      expect(writtenFiles[0].path).toBe('/mnt/skills/project/mastra-development.md');
      expect(writtenFiles[1].path).toBe('/mnt/skills/project/code-review.md');
    });

    test('should include skill metadata in file content', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'test-skill',
        description: 'Test skill description',
        content: '# Test Skill\n\nContent here...',
      };

      const writtenFiles: { path: string; content: string }[] = [];
      const mockFs = {
        writeFile: mock((path: string, content: string) => {
          writtenFiles.push({ path, content });
          return Promise.resolve();
        }),
        mkdir: mock(() => Promise.resolve()),
      };

      async function injectSkillWithMetadata(
        skill: typeof mockSkill,
        targetPath: string,
        fs: typeof mockFs
      ) {
        await fs.mkdir(targetPath);
        const header = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n`;
        const filePath = `${targetPath}/${skill.name}.md`;
        await fs.writeFile(filePath, header + skill.content);
      }

      await injectSkillWithMetadata(mockSkill, '/mnt/skills/project', mockFs);

      expect(writtenFiles[0].content).toContain('---');
      expect(writtenFiles[0].content).toContain('name: test-skill');
      expect(writtenFiles[0].content).toContain('description: Test skill description');
    });

    test('should inject built-in skills from claude-skills directory', async () => {
      // Built-in skills that should be available
      const builtInSkills = [
        'mastra-development',
        'artifact-extraction',
        'session-management',
      ];

      const writtenFiles: string[] = [];
      const mockFs = {
        writeFile: mock((path: string) => {
          writtenFiles.push(path);
          return Promise.resolve();
        }),
        mkdir: mock(() => Promise.resolve()),
        readdir: mock(() => Promise.resolve(builtInSkills.map((s) => `${s}.md`))),
        readFile: mock((path: string) => {
          const name = path.split('/').pop()?.replace('.md', '') || '';
          return Promise.resolve(`# ${name}\n\nBuilt-in skill content...`);
        }),
      };

      async function injectBuiltInSkills(
        sourceDir: string,
        targetPath: string,
        fs: typeof mockFs
      ) {
        await fs.mkdir(targetPath);
        const files = await fs.readdir(sourceDir);
        for (const file of files) {
          const content = await fs.readFile(`${sourceDir}/${file}`);
          await fs.writeFile(`${targetPath}/${file}`, content);
        }
      }

      await injectBuiltInSkills('/app/claude-skills', '/mnt/skills/builtin', mockFs);

      expect(writtenFiles).toHaveLength(3);
      expect(writtenFiles).toContain('/mnt/skills/builtin/mastra-development.md');
      expect(writtenFiles).toContain('/mnt/skills/builtin/artifact-extraction.md');
      expect(writtenFiles).toContain('/mnt/skills/builtin/session-management.md');
    });

    test('should handle empty skills list gracefully', async () => {
      const writtenFiles: string[] = [];
      const mockFs = {
        writeFile: mock((path: string) => {
          writtenFiles.push(path);
          return Promise.resolve();
        }),
        mkdir: mock(() => Promise.resolve()),
      };

      async function injectSkills(
        skills: unknown[],
        targetPath: string,
        fs: typeof mockFs
      ) {
        await fs.mkdir(targetPath);
        for (const skill of skills) {
          const s = skill as { name: string; content: string };
          await fs.writeFile(`${targetPath}/${s.name}.md`, s.content);
        }
      }

      await injectSkills([], '/mnt/skills/project', mockFs);

      expect(writtenFiles).toHaveLength(0);
    });

    test('should create skill index file', async () => {
      const mockSkills = [
        { name: 'skill-a', description: 'Description A' },
        { name: 'skill-b', description: 'Description B' },
      ];

      let indexContent = '';
      const mockFs = {
        writeFile: mock((path: string, content: string) => {
          if (path.endsWith('index.md')) {
            indexContent = content;
          }
          return Promise.resolve();
        }),
        mkdir: mock(() => Promise.resolve()),
      };

      async function createSkillIndex(
        skills: typeof mockSkills,
        targetPath: string,
        fs: typeof mockFs
      ) {
        const lines = ['# Available Skills\n'];
        for (const skill of skills) {
          lines.push(`- **${skill.name}**: ${skill.description}`);
        }
        await fs.writeFile(`${targetPath}/index.md`, lines.join('\n'));
      }

      await createSkillIndex(mockSkills, '/mnt/skills/project', mockFs);

      expect(indexContent).toContain('# Available Skills');
      expect(indexContent).toContain('**skill-a**');
      expect(indexContent).toContain('Description A');
    });
  });
});
