import { db } from '../db';
import { categoriesTable, productsTable } from '../db/schema';
import { type CreateCategoryInput, type UpdateCategoryInput, type Category } from '../schema';
import { eq, and, sql } from 'drizzle-orm';

// Handler to create a new category
export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  try {
    const result = await db.insert(categoriesTable)
      .values({
        name: input.name,
        description: input.description,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Category creation failed:', error);
    throw error;
  }
}

// Handler to get all categories
export async function getCategories(): Promise<Category[]> {
  try {
    const results = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.is_active, true))
      .orderBy(categoriesTable.name)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    throw error;
  }
}

// Handler to get category by ID
export async function getCategoryById(id: number): Promise<Category | null> {
  try {
    const results = await db.select()
      .from(categoriesTable)
      .where(and(
        eq(categoriesTable.id, id),
        eq(categoriesTable.is_active, true)
      ))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch category by ID:', error);
    throw error;
  }
}

// Handler to update category
export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  try {
    // First check if category exists
    const existing = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, input.id))
      .execute();

    if (existing.length === 0) {
      throw new Error('Category not found');
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      name: string;
      description: string | null;
      is_active: boolean;
      updated_at: Date;
    }> = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    const result = await db.update(categoriesTable)
      .set(updateData)
      .where(eq(categoriesTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Category update failed:', error);
    throw error;
  }
}

// Handler to delete category (soft delete by setting is_active to false)
export async function deleteCategory(id: number): Promise<boolean> {
  try {
    // Check if category exists
    const existing = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .execute();

    if (existing.length === 0) {
      throw new Error('Category not found');
    }

    // Check if any products are using this category
    const productsUsingCategory = await db.select({
      count: sql<number>`count(*)`
    })
      .from(productsTable)
      .where(and(
        eq(productsTable.category_id, id),
        eq(productsTable.is_active, true)
      ))
      .execute();

    const productCount = Number(productsUsingCategory[0].count);
    if (productCount > 0) {
      throw new Error(`Cannot delete category: ${productCount} active products are using this category`);
    }

    // Perform soft delete
    await db.update(categoriesTable)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(categoriesTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Category deletion failed:', error);
    throw error;
  }
}