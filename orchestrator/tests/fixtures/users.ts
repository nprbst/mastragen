// Test user fixtures for auth tests
export const testUsers = {
  admin: {
    id: 'user-admin-001',
    email: 'admin@test.com',
    name: 'Test Admin',
    avatar_url: 'https://example.com/avatar/admin.png',
    provider: 'google' as const,
    provider_id: 'google-admin-001',
  },
  member: {
    id: 'user-member-001',
    email: 'member@test.com',
    name: 'Test Member',
    avatar_url: 'https://example.com/avatar/member.png',
    provider: 'google' as const,
    provider_id: 'google-member-001',
  },
  outsider: {
    id: 'user-outsider-001',
    email: 'outsider@test.com',
    name: 'Test Outsider',
    avatar_url: null,
    provider: 'github' as const,
    provider_id: 'github-outsider-001',
  },
};

// JWT payload types for testing
export interface TestJwtPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

export function createTestJwtPayload(user: typeof testUsers.admin): TestJwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + 3600, // 1 hour
  };
}

export function createExpiredJwtPayload(user: typeof testUsers.admin): TestJwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now - 7200, // 2 hours ago
    exp: now - 3600, // expired 1 hour ago
  };
}
