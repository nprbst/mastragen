import { describe, test, expect } from 'bun:test';
import * as v from 'valibot';
import {
  IdSchema,
  SessionStateSchema,
  ArtifactNameSchema,
  EnvironmentNameSchema,
} from '../../src/schemas/common.ts';

describe('IdSchema', () => {
  test('accepts valid 6-char hex ID', () => {
    expect(() => v.parse(IdSchema, 'ABC123')).not.toThrow();
    expect(() => v.parse(IdSchema, 'abc123')).not.toThrow();
    expect(() => v.parse(IdSchema, '79F4EF')).not.toThrow();
  });

  test('rejects invalid IDs', () => {
    expect(() => v.parse(IdSchema, 'ABC12')).toThrow(); // too short
    expect(() => v.parse(IdSchema, 'ABC1234')).toThrow(); // too long
    expect(() => v.parse(IdSchema, 'GHIJKL')).toThrow(); // not hex
    expect(() => v.parse(IdSchema, '')).toThrow(); // empty
  });
});

describe('SessionStateSchema', () => {
  test('accepts valid states', () => {
    expect(v.parse(SessionStateSchema, 'active')).toBe('active');
    expect(v.parse(SessionStateSchema, 'suspended')).toBe('suspended');
  });

  test('rejects invalid states', () => {
    expect(() => v.parse(SessionStateSchema, 'pending')).toThrow();
    expect(() => v.parse(SessionStateSchema, '')).toThrow();
  });
});

describe('ArtifactNameSchema', () => {
  test('accepts valid artifact names', () => {
    expect(v.parse(ArtifactNameSchema, 'a')).toBe('a');
    expect(v.parse(ArtifactNameSchema, 'my-feature')).toBe('my-feature');
    expect(v.parse(ArtifactNameSchema, 'feature-123')).toBe('feature-123');
    expect(v.parse(ArtifactNameSchema, 'a-b-c')).toBe('a-b-c');
    expect(v.parse(ArtifactNameSchema, 'test1')).toBe('test1');
  });

  test('rejects invalid artifact names', () => {
    expect(() => v.parse(ArtifactNameSchema, '')).toThrow(); // empty
    expect(() => v.parse(ArtifactNameSchema, '-feature')).toThrow(); // starts with hyphen
    expect(() => v.parse(ArtifactNameSchema, 'feature-')).toThrow(); // ends with hyphen
    expect(() => v.parse(ArtifactNameSchema, 'My-Feature')).toThrow(); // uppercase
    expect(() => v.parse(ArtifactNameSchema, 'my_feature')).toThrow(); // underscore
    expect(() => v.parse(ArtifactNameSchema, 'my feature')).toThrow(); // space
  });

  test('rejects names over 50 characters', () => {
    const longName = 'a'.repeat(51);
    expect(() => v.parse(ArtifactNameSchema, longName)).toThrow();
  });

  test('accepts names up to 50 characters', () => {
    const maxName = 'a'.repeat(50);
    expect(v.parse(ArtifactNameSchema, maxName)).toBe(maxName);
  });
});

describe('EnvironmentNameSchema', () => {
  test('accepts valid environment names', () => {
    expect(v.parse(EnvironmentNameSchema, 'dev')).toBe('dev');
    expect(v.parse(EnvironmentNameSchema, 'staging')).toBe('staging');
    expect(v.parse(EnvironmentNameSchema, 'production')).toBe('production');
  });

  test('rejects empty environment name', () => {
    expect(() => v.parse(EnvironmentNameSchema, '')).toThrow();
  });
});
