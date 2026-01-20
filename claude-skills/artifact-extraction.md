---
name: artifact-extraction
description: Guidance on extracting reusable components, hooks, utilities, and configurations from development sessions
---

# Artifact Extraction Patterns

This skill provides guidance on extracting reusable artifacts from development sessions.

## What Are Artifacts?

Artifacts are reusable pieces of code, configuration, or documentation that can be:
- **Shared** across projects
- **Versioned** for consistency
- **Documented** for easy adoption
- **Composed** to build larger solutions

## Artifact Types

### Components

Reusable UI components with their styles and logic:

```
components/
├── UserAvatar/
│   ├── UserAvatar.tsx      # Main component
│   ├── UserAvatar.css      # Styles
│   ├── UserAvatar.test.tsx # Tests
│   └── index.ts            # Public export
```

**Extraction criteria:**
- Self-contained with minimal external dependencies
- Clear props interface with TypeScript types
- Includes tests and documentation
- Follows consistent naming conventions

### Hooks

Reusable React hooks or composables:

```typescript
// useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

**Extraction criteria:**
- Pure logic without UI dependencies
- Clear TypeScript types for inputs and outputs
- Documented edge cases and usage examples

### Utilities

Pure functions for common operations:

```typescript
// formatters.ts
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date, format = 'short'): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: format,
  }).format(date);
}
```

**Extraction criteria:**
- No side effects (pure functions)
- Comprehensive test coverage
- Handles edge cases gracefully

### Configurations

Project configurations that can be standardized:

```json
// eslint.config.json artifact
{
  "extends": ["next/core-web-vitals", "prettier"],
  "rules": {
    "no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

**Extraction criteria:**
- Well-documented options
- Compatible with target frameworks
- Includes migration guide if replacing existing config

### Templates

Project scaffolding templates:

```
templates/
├── api-route/
│   ├── route.ts.template
│   ├── route.test.ts.template
│   └── metadata.json
```

## Extraction Process

### 1. Identify Candidates

Look for code that is:
- Used in multiple places
- Has clear boundaries
- Is well-tested
- Has stable interfaces

### 2. Analyze Dependencies

```bash
# Find all imports used by the file
grep -E "^import" src/components/UserAvatar.tsx

# Check for circular dependencies
npx madge --circular src/components/UserAvatar.tsx
```

### 3. Document the Artifact

Every artifact should include:

```markdown
# UserAvatar

A flexible avatar component supporting images, initials, and status indicators.

## Installation

\`\`\`bash
npm install @your-org/user-avatar
\`\`\`

## Usage

\`\`\`tsx
import { UserAvatar } from '@your-org/user-avatar';

<UserAvatar
  src="/images/user.jpg"
  name="John Doe"
  size="md"
  status="online"
/>
\`\`\`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| src | string | - | Image URL |
| name | string | - | User's name for fallback initials |
| size | 'sm' \| 'md' \| 'lg' | 'md' | Avatar size |
| status | 'online' \| 'offline' \| 'away' | - | Status indicator |
```

### 4. Package the Artifact

Using the `/extract` command:

```bash
/extract component UserAvatar --path src/components/UserAvatar
```

This will:
1. Analyze dependencies
2. Bundle related files
3. Generate documentation
4. Create artifact package

## Best Practices

### Keep It Minimal

- Include only what's necessary
- Avoid kitchen-sink components
- Split large artifacts into smaller ones

### Version Thoughtfully

- Use semantic versioning
- Document breaking changes
- Provide migration guides

### Test Thoroughly

- Include unit tests
- Add integration tests for complex artifacts
- Test in isolation from the source project

### Document Well

- Write clear README files
- Include usage examples
- Document edge cases and limitations

## Common Patterns

### Component Library Structure

```
packages/
├── core/           # Base utilities
├── ui/             # UI components
├── hooks/          # Custom hooks
└── config/         # Shared configs
```

### Monorepo Setup

```json
// package.json
{
  "workspaces": [
    "packages/*"
  ]
}
```

### Publishing Strategy

1. **Internal packages**: Use npm private registry or GitHub Packages
2. **Public packages**: Publish to npm with appropriate license
3. **Monorepo**: Use Turborepo or Nx for efficient builds
