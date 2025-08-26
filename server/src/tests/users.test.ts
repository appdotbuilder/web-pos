import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from '../handlers/users';
import { eq } from 'drizzle-orm';

// Test input data
const testUserInput: CreateUserInput = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123',
  role: 'kasir',
  full_name: 'Test User',
};

const adminUserInput: CreateUserInput = {
  username: 'admin',
  email: 'admin@example.com',
  password: 'adminpass123',
  role: 'admin',
  full_name: 'Admin User',
};

describe('User Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with valid input', async () => {
      const result = await createUser(testUserInput);

      expect(result.username).toEqual('testuser');
      expect(result.email).toEqual('test@example.com');
      expect(result.role).toEqual('kasir');
      expect(result.full_name).toEqual('Test User');
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual('password123'); // Should be hashed
    });

    it('should save user to database', async () => {
      const result = await createUser(testUserInput);

      const dbUsers = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(dbUsers).toHaveLength(1);
      expect(dbUsers[0].username).toEqual('testuser');
      expect(dbUsers[0].email).toEqual('test@example.com');
      expect(dbUsers[0].role).toEqual('kasir');
      expect(dbUsers[0].is_active).toBe(true);
    });

    it('should create admin user', async () => {
      const result = await createUser(adminUserInput);

      expect(result.role).toEqual('admin');
      expect(result.username).toEqual('admin');
      expect(result.full_name).toEqual('Admin User');
    });

    it('should reject duplicate username', async () => {
      await createUser(testUserInput);
      
      const duplicateUser = {
        ...testUserInput,
        email: 'different@example.com'
      };

      await expect(createUser(duplicateUser)).rejects.toThrow();
    });

    it('should reject duplicate email', async () => {
      await createUser(testUserInput);
      
      const duplicateEmail = {
        ...testUserInput,
        username: 'differentuser'
      };

      await expect(createUser(duplicateEmail)).rejects.toThrow();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toEqual([]);
    });

    it('should return all users', async () => {
      await createUser(testUserInput);
      await createUser(adminUserInput);

      const result = await getUsers();
      
      expect(result).toHaveLength(2);
      expect(result.map(u => u.username)).toContain('testuser');
      expect(result.map(u => u.username)).toContain('admin');
      expect(result.map(u => u.role)).toContain('kasir');
      expect(result.map(u => u.role)).toContain('admin');
    });

    it('should include all required fields', async () => {
      await createUser(testUserInput);
      const result = await getUsers();

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('username');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).toHaveProperty('password_hash');
      expect(result[0]).toHaveProperty('role');
      expect(result[0]).toHaveProperty('full_name');
      expect(result[0]).toHaveProperty('is_active');
      expect(result[0]).toHaveProperty('created_at');
      expect(result[0]).toHaveProperty('updated_at');
    });

    it('should include inactive users', async () => {
      const user = await createUser(testUserInput);
      await deleteUser(user.id); // Soft delete

      const result = await getUsers();
      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(false);
    });
  });

  describe('getUserById', () => {
    it('should return null for non-existent user', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user by ID', async () => {
      const user = await createUser(testUserInput);
      const result = await getUserById(user.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(user.id);
      expect(result!.username).toEqual('testuser');
      expect(result!.email).toEqual('test@example.com');
      expect(result!.role).toEqual('kasir');
    });

    it('should return inactive user by ID', async () => {
      const user = await createUser(testUserInput);
      await deleteUser(user.id); // Soft delete
      
      const result = await getUserById(user.id);
      expect(result).not.toBeNull();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('updateUser', () => {
    it('should update username', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        username: 'updateduser'
      };

      const result = await updateUser(updateInput);
      
      expect(result.username).toEqual('updateduser');
      expect(result.email).toEqual(testUserInput.email); // Unchanged
      expect(result.updated_at > user.updated_at).toBe(true);
    });

    it('should update email', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        email: 'updated@example.com'
      };

      const result = await updateUser(updateInput);
      
      expect(result.email).toEqual('updated@example.com');
      expect(result.username).toEqual(testUserInput.username); // Unchanged
    });

    it('should update role', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        role: 'admin'
      };

      const result = await updateUser(updateInput);
      
      expect(result.role).toEqual('admin');
    });

    it('should update password and hash it', async () => {
      const user = await createUser(testUserInput);
      const originalPasswordHash = user.password_hash;
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        password: 'newpassword123'
      };

      const result = await updateUser(updateInput);
      
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual('newpassword123'); // Should be hashed
      expect(result.password_hash).not.toEqual(originalPasswordHash); // Should be different
    });

    it('should update multiple fields', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        username: 'multifielduser',
        email: 'multifield@example.com',
        role: 'admin',
        full_name: 'Multi Field User',
        is_active: false
      };

      const result = await updateUser(updateInput);
      
      expect(result.username).toEqual('multifielduser');
      expect(result.email).toEqual('multifield@example.com');
      expect(result.role).toEqual('admin');
      expect(result.full_name).toEqual('Multi Field User');
      expect(result.is_active).toBe(false);
    });

    it('should update database record', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        full_name: 'Database Updated User'
      };

      await updateUser(updateInput);

      const dbUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(dbUser[0].full_name).toEqual('Database Updated User');
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateUserInput = {
        id: 999,
        username: 'nonexistent'
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/not found/i);
    });

    it('should reject duplicate username on update', async () => {
      const user1 = await createUser(testUserInput);
      const user2 = await createUser(adminUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user2.id,
        username: 'testuser' // Try to use user1's username
      };

      await expect(updateUser(updateInput)).rejects.toThrow();
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user (set is_active to false)', async () => {
      const user = await createUser(testUserInput);
      expect(user.is_active).toBe(true);
      
      const result = await deleteUser(user.id);
      expect(result).toBe(true);

      const updatedUser = await getUserById(user.id);
      expect(updatedUser).not.toBeNull();
      expect(updatedUser!.is_active).toBe(false);
    });

    it('should update database record on delete', async () => {
      const user = await createUser(testUserInput);
      
      await deleteUser(user.id);

      const dbUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(dbUser[0].is_active).toBe(false);
      expect(dbUser[0].updated_at > user.updated_at).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const result = await deleteUser(999);
      expect(result).toBe(false);
    });

    it('should allow deleting already deleted user', async () => {
      const user = await createUser(testUserInput);
      
      const result1 = await deleteUser(user.id);
      expect(result1).toBe(true);
      
      const result2 = await deleteUser(user.id);
      expect(result2).toBe(true); // Should still return true
    });
  });

  describe('password verification', () => {
    it('should be able to verify hashed password', async () => {
      const user = await createUser(testUserInput);
      
      // Using Bun's password verification
      const isValid = await Bun.password.verify('password123', user.password_hash);
      expect(isValid).toBe(true);
      
      const isInvalid = await Bun.password.verify('wrongpassword', user.password_hash);
      expect(isInvalid).toBe(false);
    });

    it('should verify updated password', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        password: 'newpassword456'
      };

      const updatedUser = await updateUser(updateInput);
      
      const isValid = await Bun.password.verify('newpassword456', updatedUser.password_hash);
      expect(isValid).toBe(true);
      
      const oldPasswordInvalid = await Bun.password.verify('password123', updatedUser.password_hash);
      expect(oldPasswordInvalid).toBe(false);
    });
  });
});