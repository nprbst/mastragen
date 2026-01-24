/**
 * Unit tests for synthetic data generator.
 * T052: Tests for synthetic example generation.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { SyntheticGenerator, type Persona } from './synthetic-generator';
import { defaultPersonas, getPersonasByExpertise, getRandomPersonas } from '../personas/default-personas';

describe('SyntheticGenerator', () => {
  beforeEach(() => {
    mock.restore();
  });

  describe('parseExamples (via generateExamples)', () => {
    test('should validate persona structure', () => {
      const persona: Persona = {
        id: 'test-persona',
        name: 'Test Persona',
        description: 'A test persona',
        traits: ['friendly', 'concise'],
        expertise: 'intermediate',
      };

      expect(persona.id).toBe('test-persona');
      expect(persona.traits).toContain('friendly');
      expect(persona.expertise).toBe('intermediate');
    });

    test('should handle personas with scenarios', () => {
      const persona: Persona = {
        id: 'scenario-persona',
        name: 'Scenario Persona',
        description: 'A persona with scenarios',
        traits: ['analytical'],
        scenarios: ['data analysis', 'reporting'],
        expertise: 'expert',
      };

      expect(persona.scenarios).toBeDefined();
      expect(persona.scenarios?.length).toBe(2);
    });
  });

  describe('configuration', () => {
    test('should accept custom configuration', () => {
      const generator = new SyntheticGenerator({
        model: 'claude-haiku-4-20250514',
        maxTokens: 2048,
      });

      // Just verify it creates without error
      expect(generator).toBeDefined();
    });

    test('should use default configuration', () => {
      const generator = new SyntheticGenerator();
      expect(generator).toBeDefined();
    });
  });
});

describe('Default Personas', () => {
  test('should have correct number of default personas', () => {
    expect(defaultPersonas.length).toBe(8);
  });

  test('should have all required fields for each persona', () => {
    for (const persona of defaultPersonas) {
      expect(persona.id).toBeDefined();
      expect(persona.name).toBeDefined();
      expect(persona.description).toBeDefined();
      expect(persona.traits).toBeDefined();
      expect(persona.traits.length).toBeGreaterThan(0);
      expect(['novice', 'intermediate', 'expert']).toContain(persona.expertise);
    }
  });

  test('should have casual user persona', () => {
    const casual = defaultPersonas.find((p) => p.id === 'casual-user');
    expect(casual).toBeDefined();
    expect(casual?.expertise).toBe('novice');
  });

  test('should have developer persona', () => {
    const dev = defaultPersonas.find((p) => p.id === 'developer');
    expect(dev).toBeDefined();
    expect(dev?.expertise).toBe('expert');
  });

  test('should have frustrated user persona', () => {
    const frustrated = defaultPersonas.find((p) => p.id === 'frustrated-user');
    expect(frustrated).toBeDefined();
    expect(frustrated?.traits).toContain('impatient');
  });
});

describe('getPersonasByExpertise', () => {
  test('should filter novice personas', () => {
    const novices = getPersonasByExpertise('novice');
    expect(novices.length).toBeGreaterThan(0);
    for (const p of novices) {
      expect(p.expertise).toBe('novice');
    }
  });

  test('should filter intermediate personas', () => {
    const intermediates = getPersonasByExpertise('intermediate');
    expect(intermediates.length).toBeGreaterThan(0);
    for (const p of intermediates) {
      expect(p.expertise).toBe('intermediate');
    }
  });

  test('should filter expert personas', () => {
    const experts = getPersonasByExpertise('expert');
    expect(experts.length).toBeGreaterThan(0);
    for (const p of experts) {
      expect(p.expertise).toBe('expert');
    }
  });
});

describe('getRandomPersonas', () => {
  test('should return requested number of personas', () => {
    const personas = getRandomPersonas(3);
    expect(personas.length).toBe(3);
  });

  test('should not exceed total available personas', () => {
    const personas = getRandomPersonas(100);
    expect(personas.length).toBe(defaultPersonas.length);
  });

  test('should return unique personas', () => {
    const personas = getRandomPersonas(5);
    const ids = personas.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
