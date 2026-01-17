import { describe, test, expect } from 'bun:test';
import * as v from 'valibot';
import {
  CreateSessionRequestSchema,
  SessionResponseSchema,
  SessionWithUrlsResponseSchema,
  ListSessionsFilterSchema,
} from '../../src/schemas/sessions.ts';

describe('CreateSessionRequestSchema', () => {
  test('accepts valid request', () => {
    const valid = {
      projectId: 'ABC123',
      artifactName: 'my-feature',
      environment: 'dev',
    };
    const result = v.parse(CreateSessionRequestSchema, valid);
    expect(result).toEqual(valid);
  });

  test('rejects missing fields', () => {
    expect(() => v.parse(CreateSessionRequestSchema, {})).toThrow();
    expect(() =>
      v.parse(CreateSessionRequestSchema, { projectId: 'ABC123' })
    ).toThrow();
    expect(() =>
      v.parse(CreateSessionRequestSchema, {
        projectId: 'ABC123',
        artifactName: 'test',
      })
    ).toThrow();
  });

  test('rejects invalid projectId', () => {
    expect(() =>
      v.parse(CreateSessionRequestSchema, {
        projectId: 'invalid',
        artifactName: 'test',
        environment: 'dev',
      })
    ).toThrow();
  });

  test('rejects invalid artifactName', () => {
    expect(() =>
      v.parse(CreateSessionRequestSchema, {
        projectId: 'ABC123',
        artifactName: '-invalid',
        environment: 'dev',
      })
    ).toThrow();
  });

  test('rejects empty environment', () => {
    expect(() =>
      v.parse(CreateSessionRequestSchema, {
        projectId: 'ABC123',
        artifactName: 'test',
        environment: '',
      })
    ).toThrow();
  });
});

describe('SessionResponseSchema', () => {
  test('accepts valid session response', () => {
    const valid = {
      id: 'abc123',
      projectId: 'def456',
      artifactName: 'my-feature',
      environment: 'dev',
      state: 'active',
      createdAt: '2024-01-17T12:00:00Z',
      updatedAt: '2024-01-17T12:00:00Z',
    };
    const result = v.parse(SessionResponseSchema, valid);
    expect(result).toEqual(valid);
  });

  test('accepts suspended state', () => {
    const valid = {
      id: 'abc123',
      projectId: 'def456',
      artifactName: 'my-feature',
      environment: 'dev',
      state: 'suspended',
      createdAt: '2024-01-17T12:00:00Z',
      updatedAt: '2024-01-17T12:00:00Z',
    };
    expect(v.parse(SessionResponseSchema, valid).state).toBe('suspended');
  });

  test('rejects invalid state', () => {
    expect(() =>
      v.parse(SessionResponseSchema, {
        id: 'abc123',
        projectId: 'def456',
        artifactName: 'my-feature',
        environment: 'dev',
        state: 'invalid',
        createdAt: '2024-01-17T12:00:00Z',
        updatedAt: '2024-01-17T12:00:00Z',
      })
    ).toThrow();
  });
});

describe('SessionWithUrlsResponseSchema', () => {
  test('accepts valid session with URLs', () => {
    const valid = {
      id: 'abc123',
      projectId: 'def456',
      artifactName: 'my-feature',
      environment: 'dev',
      state: 'active',
      createdAt: '2024-01-17T12:00:00Z',
      updatedAt: '2024-01-17T12:00:00Z',
      urls: {
        cui: 'http://localhost:3001',
        mastra: 'http://localhost:4111',
        vscode: 'http://localhost:8080',
      },
    };
    const result = v.parse(SessionWithUrlsResponseSchema, valid);
    expect(result).toEqual(valid);
    expect(result.urls.cui).toBe('http://localhost:3001');
  });

  test('rejects missing URLs', () => {
    const invalid = {
      id: 'abc123',
      projectId: 'def456',
      artifactName: 'my-feature',
      environment: 'dev',
      state: 'active',
      createdAt: '2024-01-17T12:00:00Z',
      updatedAt: '2024-01-17T12:00:00Z',
    };
    expect(() => v.parse(SessionWithUrlsResponseSchema, invalid)).toThrow();
  });
});

describe('ListSessionsFilterSchema', () => {
  test('accepts empty filter', () => {
    const result = v.parse(ListSessionsFilterSchema, {});
    expect(result).toEqual({});
  });

  test('accepts state filter', () => {
    expect(v.parse(ListSessionsFilterSchema, { state: 'active' })).toEqual({
      state: 'active',
    });
    expect(v.parse(ListSessionsFilterSchema, { state: 'suspended' })).toEqual({
      state: 'suspended',
    });
  });

  test('accepts projectId filter', () => {
    expect(v.parse(ListSessionsFilterSchema, { projectId: 'ABC123' })).toEqual({
      projectId: 'ABC123',
    });
  });

  test('accepts combined filters', () => {
    const result = v.parse(ListSessionsFilterSchema, {
      state: 'active',
      projectId: 'ABC123',
    });
    expect(result).toEqual({ state: 'active', projectId: 'ABC123' });
  });

  test('rejects invalid state', () => {
    expect(() =>
      v.parse(ListSessionsFilterSchema, { state: 'invalid' })
    ).toThrow();
  });
});
