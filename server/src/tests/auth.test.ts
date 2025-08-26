import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput } from '../schema';
import { authenticateUser, getCurrentUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test user data
const testUserData = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'testpassword123',
  role: 'kasir' as const,
  full_name: 'Test User',
  is_active: true,
};

const adminUserData = {
  username: 'admin',
  email: 'admin@example.com',
  password: 'adminpassword123',
  role: 'admin' as const,
  full_name: 'Admin User',
  is_active: true,
};

const inactiveUserData = {
  username: 'inactive',
  email: 'inactive@example.com',
  password: 'inactivepassword123',
  role: 'kasir' as const,
  full_name: 'Inactive User',
  is_active: false,
};

describe('authenticateUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should authenticate user with valid credentials', async () => {
    // Create test user with hashed password
    const hashedPassword = await Bun.password.hash(testUserData.password);
    const insertResult = await db.insert(usersTable)
      .values({
        ...testUserData,
        password_hash: hashedPassword,
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Test authentication
    const loginInput: LoginInput = {
      username: testUserData.username,
      password: testUserData.password,
    };

    const result = await authenticateUser(loginInput);

    // Verify authentication success
    expect(result).toBeDefined();
    expect(result?.id).toEqual(createdUser.id);
    expect(result?.username).toEqual(testUserData.username);
    expect(result?.email).toEqual(testUserData.email);
    expect(result?.role).toEqual(testUserData.role);
    expect(result?.full_name).toEqual(testUserData.full_name);
    expect(result?.is_active).toEqual(true);
    expect(result?.password_hash).toEqual(hashedPassword);
    expect(result?.created_at).toBeInstanceOf(Date);
    expect(result?.updated_at).toBeInstanceOf(Date);
  });

  it('should authenticate admin user with valid credentials', async () => {
    // Create admin user
    const hashedPassword = await Bun.password.hash(adminUserData.password);
    await db.insert(usersTable)
      .values({
        ...adminUserData,
        password_hash: hashedPassword,
      })
      .execute();

    // Test authentication
    const loginInput: LoginInput = {
      username: adminUserData.username,
      password: adminUserData.password,
    };

    const result = await authenticateUser(loginInput);

    expect(result).toBeDefined();
    expect(result?.username).toEqual(adminUserData.username);
    expect(result?.role).toEqual('admin');
  });

  it('should return null for invalid username', async () => {
    // Create test user
    const hashedPassword = await Bun.password.hash(testUserData.password);
    await db.insert(usersTable)
      .values({
        ...testUserData,
        password_hash: hashedPassword,
      })
      .execute();

    // Test with non-existent username
    const loginInput: LoginInput = {
      username: 'nonexistent',
      password: testUserData.password,
    };

    const result = await authenticateUser(loginInput);
    expect(result).toBeNull();
  });

  it('should return null for invalid password', async () => {
    // Create test user
    const hashedPassword = await Bun.password.hash(testUserData.password);
    await db.insert(usersTable)
      .values({
        ...testUserData,
        password_hash: hashedPassword,
      })
      .execute();

    // Test with wrong password
    const loginInput: LoginInput = {
      username: testUserData.username,
      password: 'wrongpassword',
    };

    const result = await authenticateUser(loginInput);
    expect(result).toBeNull();
  });

  it('should return null for inactive user', async () => {
    // Create inactive user
    const hashedPassword = await Bun.password.hash(inactiveUserData.password);
    await db.insert(usersTable)
      .values({
        ...inactiveUserData,
        password_hash: hashedPassword,
      })
      .execute();

    // Test authentication
    const loginInput: LoginInput = {
      username: inactiveUserData.username,
      password: inactiveUserData.password,
    };

    const result = await authenticateUser(loginInput);
    expect(result).toBeNull();
  });

  it('should handle case-sensitive username', async () => {
    // Create test user
    const hashedPassword = await Bun.password.hash(testUserData.password);
    await db.insert(usersTable)
      .values({
        ...testUserData,
        password_hash: hashedPassword,
      })
      .execute();

    // Test with different case
    const loginInput: LoginInput = {
      username: testUserData.username.toUpperCase(),
      password: testUserData.password,
    };

    const result = await authenticateUser(loginInput);
    expect(result).toBeNull();
  });
});

describe('getCurrentUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user by valid ID', async () => {
    // Create test user
    const hashedPassword = await Bun.password.hash(testUserData.password);
    const insertResult = await db.insert(usersTable)
      .values({
        ...testUserData,
        password_hash: hashedPassword,
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getCurrentUser(createdUser.id);

    // Verify user data
    expect(result).toBeDefined();
    expect(result?.id).toEqual(createdUser.id);
    expect(result?.username).toEqual(testUserData.username);
    expect(result?.email).toEqual(testUserData.email);
    expect(result?.role).toEqual(testUserData.role);
    expect(result?.full_name).toEqual(testUserData.full_name);
    expect(result?.is_active).toEqual(true);
    expect(result?.password_hash).toEqual(hashedPassword);
    expect(result?.created_at).toBeInstanceOf(Date);
    expect(result?.updated_at).toBeInstanceOf(Date);
  });

  it('should return admin user by valid ID', async () => {
    // Create admin user
    const hashedPassword = await Bun.password.hash(adminUserData.password);
    const insertResult = await db.insert(usersTable)
      .values({
        ...adminUserData,
        password_hash: hashedPassword,
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user by ID
    const result = await getCurrentUser(createdUser.id);

    expect(result).toBeDefined();
    expect(result?.username).toEqual(adminUserData.username);
    expect(result?.role).toEqual('admin');
  });

  it('should return null for non-existent user ID', async () => {
    // Test with non-existent ID
    const result = await getCurrentUser(99999);
    expect(result).toBeNull();
  });

  it('should return null for inactive user', async () => {
    // Create inactive user
    const hashedPassword = await Bun.password.hash(inactiveUserData.password);
    const insertResult = await db.insert(usersTable)
      .values({
        ...inactiveUserData,
        password_hash: hashedPassword,
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Try to get inactive user
    const result = await getCurrentUser(createdUser.id);
    expect(result).toBeNull();
  });

  it('should handle zero and negative user IDs', async () => {
    // Test with invalid IDs
    let result = await getCurrentUser(0);
    expect(result).toBeNull();

    result = await getCurrentUser(-1);
    expect(result).toBeNull();
  });

  it('should verify user exists in database after retrieval', async () => {
    // Create test user
    const hashedPassword = await Bun.password.hash(testUserData.password);
    const insertResult = await db.insert(usersTable)
      .values({
        ...testUserData,
        password_hash: hashedPassword,
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Get user through handler
    const result = await getCurrentUser(createdUser.id);

    // Verify user exists in database
    const dbUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, createdUser.id))
      .execute();

    expect(dbUsers).toHaveLength(1);
    expect(result).toBeDefined();
    expect(dbUsers[0].id).toEqual(result!.id);
    expect(dbUsers[0].username).toEqual(result!.username);
    expect(dbUsers[0].is_active).toEqual(true);
  });
});