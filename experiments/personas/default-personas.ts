/**
 * Default personas for synthetic data generation.
 * T048: Predefined personas representing different user types.
 */

import type { Persona } from '../lib/synthetic-generator';

/**
 * Casual user persona - everyday users with basic needs.
 */
export const casualUser: Persona = {
  id: 'casual-user',
  name: 'Casual User',
  description: 'An everyday user who uses the system occasionally for basic tasks.',
  traits: ['informal', 'brief', 'may use typos', 'asks simple questions'],
  scenarios: [
    'quick lookup',
    'simple task completion',
    'basic troubleshooting',
  ],
  expertise: 'novice',
};

/**
 * Power user persona - frequent users who know the system well.
 */
export const powerUser: Persona = {
  id: 'power-user',
  name: 'Power User',
  description: 'A frequent user who leverages advanced features efficiently.',
  traits: ['precise', 'uses shortcuts', 'expects quick responses', 'technical vocabulary'],
  scenarios: [
    'complex workflows',
    'batch operations',
    'advanced configuration',
    'automation setup',
  ],
  expertise: 'expert',
};

/**
 * Developer persona - technical users building integrations.
 */
export const developer: Persona = {
  id: 'developer',
  name: 'Developer',
  description: 'A software developer using the system for technical tasks.',
  traits: ['technical', 'detail-oriented', 'expects API-level answers', 'code-focused'],
  scenarios: [
    'API integration',
    'debugging',
    'code generation',
    'technical documentation',
  ],
  expertise: 'expert',
};

/**
 * Business analyst persona - non-technical but analytical users.
 */
export const businessAnalyst: Persona = {
  id: 'business-analyst',
  name: 'Business Analyst',
  description: 'An analytical professional focused on data and insights.',
  traits: ['structured', 'data-driven', 'formal tone', 'asks for explanations'],
  scenarios: [
    'data analysis',
    'report generation',
    'metrics tracking',
    'decision support',
  ],
  expertise: 'intermediate',
};

/**
 * Skeptical user persona - users who need convincing.
 */
export const skepticalUser: Persona = {
  id: 'skeptical-user',
  name: 'Skeptical User',
  description: 'A cautious user who questions responses and needs verification.',
  traits: ['questioning', 'asks for sources', 'verifies claims', 'requests alternatives'],
  scenarios: [
    'fact checking',
    'comparing options',
    'validating recommendations',
    'security concerns',
  ],
  expertise: 'intermediate',
};

/**
 * Frustrated user persona - users having a bad experience.
 */
export const frustratedUser: Persona = {
  id: 'frustrated-user',
  name: 'Frustrated User',
  description: 'A user experiencing issues and showing frustration.',
  traits: ['impatient', 'emotional', 'may be unclear', 'needs empathy'],
  scenarios: [
    'repeated failures',
    'confusing errors',
    'unmet expectations',
    'escalation requests',
  ],
  expertise: 'novice',
};

/**
 * Non-native speaker persona - users with language barriers.
 */
export const nonNativeSpeaker: Persona = {
  id: 'non-native-speaker',
  name: 'Non-Native Speaker',
  description: 'A user communicating in a non-native language.',
  traits: ['may have grammatical errors', 'uses simpler vocabulary', 'may be more formal'],
  scenarios: [
    'translation needs',
    'clarification requests',
    'cultural differences',
  ],
  expertise: 'intermediate',
};

/**
 * Executive persona - high-level decision makers.
 */
export const executive: Persona = {
  id: 'executive',
  name: 'Executive',
  description: 'A senior leader focused on high-level outcomes.',
  traits: ['brief', 'results-focused', 'expects summaries', 'time-constrained'],
  scenarios: [
    'executive summaries',
    'strategic decisions',
    'quick overviews',
    'delegation tasks',
  ],
  expertise: 'novice',
};

/**
 * All default personas.
 */
export const defaultPersonas: Persona[] = [
  casualUser,
  powerUser,
  developer,
  businessAnalyst,
  skepticalUser,
  frustratedUser,
  nonNativeSpeaker,
  executive,
];

/**
 * Get personas by expertise level.
 */
export function getPersonasByExpertise(
  expertise: 'novice' | 'intermediate' | 'expert'
): Persona[] {
  return defaultPersonas.filter((p) => p.expertise === expertise);
}

/**
 * Get a random subset of personas.
 */
export function getRandomPersonas(count: number): Persona[] {
  const shuffled = [...defaultPersonas].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
