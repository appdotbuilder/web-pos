import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

// Authentication handler for user login
export async function authenticateUser(input: LoginInput): Promise<User | null> {
  try {
    // Find user by username
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.username, input.username))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return null;
    }

    // Verify password using Bun's built-in password verification
    const isValidPassword = await Bun.password.verify(input.password, user.password_hash);
    
    if (!isValidPassword) {
      return null;
    }

    // Return user data (excluding password hash)
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password_hash: user.password_hash,
      role: user.role,
      full_name: user.full_name,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}

// Handler to get current user by ID (for session validation)
export async function getCurrentUser(userId: number): Promise<User | null> {
  try {
    // Find user by ID
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      password_hash: user.password_hash,
      role: user.role,
      full_name: user.full_name,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
}