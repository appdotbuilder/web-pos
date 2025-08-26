import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { categoriesTable, productsTable } from '../db/schema';
import { type CreateCategoryInput, type UpdateCategoryInput } from '../schema';
import { 
  createCategory, 
  getCategories, 
  getCategoryById, 
  updateCategory, 
  deleteCategory 
} from '../handlers/categories';
import { eq, and } from 'drizzle-orm';

// Test data
const testCategoryInput: CreateCategoryInput = {
  name: 'Electronics',
  description: 'Electronic devices and accessories',
};

const testCategoryInput2: CreateCategoryInput = {
  name: 'Food & Beverages',
  description: 'Food items and drinks',
};

const testCategoryInputNullDescription: CreateCategoryInput = {
  name: 'Home & Garden',
  description: null,
};

describe('Category Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createCategory', () => {
    it('should create a category with description', async () => {
      const result = await createCategory(testCategoryInput);

      expect(result.name).toEqual('Electronics');
      expect(result.description).toEqual('Electronic devices and accessories');
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a category with null description', async () => {
      const result = await createCategory(testCategoryInputNullDescription);

      expect(result.name).toEqual('Home & Garden');
      expect(result.description).toBeNull();
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
    });

    it('should save category to database', async () => {
      const result = await createCategory(testCategoryInput);

      const categories = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, result.id))
        .execute();

      expect(categories).toHaveLength(1);
      expect(categories[0].name).toEqual('Electronics');
      expect(categories[0].description).toEqual('Electronic devices and accessories');
      expect(categories[0].is_active).toBe(true);
    });
  });

  describe('getCategories', () => {
    it('should return empty array when no categories exist', async () => {
      const result = await getCategories();
      expect(result).toHaveLength(0);
    });

    it('should return all active categories', async () => {
      // Create test categories
      await createCategory(testCategoryInput);
      await createCategory(testCategoryInput2);

      const result = await getCategories();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Electronics'); // Should be ordered by name
      expect(result[1].name).toEqual('Food & Beverages');
    });

    it('should not return inactive categories', async () => {
      // Create category and then deactivate it
      const category = await createCategory(testCategoryInput);
      await db.update(categoriesTable)
        .set({ is_active: false })
        .where(eq(categoriesTable.id, category.id))
        .execute();

      const result = await getCategories();
      expect(result).toHaveLength(0);
    });

    it('should return categories ordered by name', async () => {
      // Create in reverse alphabetical order
      await createCategory({ name: 'Zebra Category', description: null });
      await createCategory({ name: 'Alpha Category', description: null });
      await createCategory({ name: 'Beta Category', description: null });

      const result = await getCategories();

      expect(result).toHaveLength(3);
      expect(result[0].name).toEqual('Alpha Category');
      expect(result[1].name).toEqual('Beta Category');
      expect(result[2].name).toEqual('Zebra Category');
    });
  });

  describe('getCategoryById', () => {
    it('should return null when category does not exist', async () => {
      const result = await getCategoryById(999);
      expect(result).toBeNull();
    });

    it('should return category when it exists', async () => {
      const created = await createCategory(testCategoryInput);
      const result = await getCategoryById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Electronics');
      expect(result!.description).toEqual('Electronic devices and accessories');
    });

    it('should return null for inactive category', async () => {
      const created = await createCategory(testCategoryInput);
      
      // Deactivate category
      await db.update(categoriesTable)
        .set({ is_active: false })
        .where(eq(categoriesTable.id, created.id))
        .execute();

      const result = await getCategoryById(created.id);
      expect(result).toBeNull();
    });
  });

  describe('updateCategory', () => {
    it('should update category name', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        name: 'Updated Electronics',
      };

      const result = await updateCategory(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Electronics');
      expect(result.description).toEqual(created.description); // Should remain unchanged
      expect(result.is_active).toBe(true);
      expect(result.updated_at).not.toEqual(created.updated_at);
    });

    it('should update category description', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        description: 'Updated description',
      };

      const result = await updateCategory(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual(created.name); // Should remain unchanged
      expect(result.description).toEqual('Updated description');
    });

    it('should update category active status', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        is_active: false,
      };

      const result = await updateCategory(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.is_active).toBe(false);
    });

    it('should update multiple fields at once', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        name: 'Multi-Updated Category',
        description: 'Multi-updated description',
        is_active: false,
      };

      const result = await updateCategory(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Multi-Updated Category');
      expect(result.description).toEqual('Multi-updated description');
      expect(result.is_active).toBe(false);
    });

    it('should throw error when category does not exist', async () => {
      const updateInput: UpdateCategoryInput = {
        id: 999,
        name: 'Non-existent',
      };

      await expect(updateCategory(updateInput)).rejects.toThrow(/Category not found/i);
    });

    it('should save changes to database', async () => {
      const created = await createCategory(testCategoryInput);
      
      const updateInput: UpdateCategoryInput = {
        id: created.id,
        name: 'Database Updated Category',
      };

      await updateCategory(updateInput);

      const dbCategory = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, created.id))
        .execute();

      expect(dbCategory).toHaveLength(1);
      expect(dbCategory[0].name).toEqual('Database Updated Category');
    });
  });

  describe('deleteCategory', () => {
    it('should soft delete category when no products use it', async () => {
      const created = await createCategory(testCategoryInput);
      
      const result = await deleteCategory(created.id);

      expect(result).toBe(true);

      // Category should still exist in database but be inactive
      const dbCategory = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, created.id))
        .execute();

      expect(dbCategory).toHaveLength(1);
      expect(dbCategory[0].is_active).toBe(false);
    });

    it('should throw error when category does not exist', async () => {
      await expect(deleteCategory(999)).rejects.toThrow(/Category not found/i);
    });

    it('should throw error when active products use the category', async () => {
      // Create category first
      const category = await createCategory(testCategoryInput);

      // Create a product that uses this category
      await db.insert(productsTable)
        .values({
          name: 'Test Product',
          category_id: category.id,
          purchase_price: '10.00',
          selling_price: '15.00',
          stock_quantity: 100,
          min_stock: 10,
        })
        .execute();

      await expect(deleteCategory(category.id))
        .rejects.toThrow(/Cannot delete category.*products are using this category/i);
    });

    it('should allow deletion when products using category are inactive', async () => {
      // Create category
      const category = await createCategory(testCategoryInput);

      // Create an inactive product that uses this category
      await db.insert(productsTable)
        .values({
          name: 'Inactive Product',
          category_id: category.id,
          purchase_price: '10.00',
          selling_price: '15.00',
          stock_quantity: 100,
          min_stock: 10,
          is_active: false, // Inactive product
        })
        .execute();

      const result = await deleteCategory(category.id);

      expect(result).toBe(true);

      // Verify category is deactivated
      const dbCategory = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, category.id))
        .execute();

      expect(dbCategory[0].is_active).toBe(false);
    });

    it('should update timestamp when deleting', async () => {
      const created = await createCategory(testCategoryInput);
      const originalUpdatedAt = created.updated_at;

      // Add small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await deleteCategory(created.id);

      const dbCategory = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, created.id))
        .execute();

      expect(dbCategory[0].updated_at).not.toEqual(originalUpdatedAt);
    });
  });
});