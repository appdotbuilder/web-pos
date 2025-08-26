import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

// Simple hash function for password (in production, use bcrypt)
const hashPassword = async (password: string): Promise<string> => {
  // Using Bun's built-in password hashing
  return await Bun.password.hash(password);
};

// Handler to create a new user
export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    const hashedPassword = await hashPassword(input.password);
    
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        email: input.email,
        password_hash: hashedPassword,
        role: input.role,
        full_name: input.full_name,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

// Handler to get all users
export async function getUsers(): Promise<User[]> {
  try {
    const results = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      password_hash: usersTable.password_hash, // Include for User type compatibility
      role: usersTable.role,
      full_name: usersTable.full_name,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .execute();

    return results;
  } catch (error) {
    console.error('Get users failed:', error);
    throw error;
  }
}

// Handler to get user by ID
export async function getUserById(id: number): Promise<User | null> {
  try {
    const results = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      password_hash: usersTable.password_hash, // Include for User type compatibility
      role: usersTable.role,
      full_name: usersTable.full_name,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Get user by ID failed:', error);
    throw error;
  }
}

// Handler to update user
export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    const updateData: any = {};
    
    if (input.username !== undefined) updateData.username = input.username;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.full_name !== undefined) updateData.full_name = input.full_name;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    
    // Hash password if provided
    if (input.password !== undefined) {
      updateData.password_hash = await hashPassword(input.password);
    }
    
    // Always update the updated_at timestamp
    updateData.updated_at = new Date();

    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('User not found');
    }

    return result[0];
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

// Handler to delete user (soft delete by setting is_active to false)
export async function deleteUser(id: number): Promise<boolean> {
  try {
    const result = await db.update(usersTable)
      .set({ 
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}