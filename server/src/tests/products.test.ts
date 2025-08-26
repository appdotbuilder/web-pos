import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { productsTable, categoriesTable } from '../db/schema';
import { 
  type CreateProductInput, 
  type UpdateProductInput, 
  type ProductSearchInput 
} from '../schema';
import {
  createProduct,
  getProducts,
  getProductById,
  getProductByBarcode,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
  updateProductStock
} from '../handlers/products';
import { eq, and } from 'drizzle-orm';

// Test data
const createTestCategory = async () => {
  const result = await db.insert(categoriesTable)
    .values({
      name: 'Test Category',
      description: 'A category for testing'
    })
    .returning()
    .execute();
  return result[0];
};

const testProductInput: CreateProductInput = {
  name: 'Test Product',
  description: 'A product for testing',
  barcode: 'TEST123',
  category_id: 1, // Will be updated in tests
  purchase_price: 10.00,
  selling_price: 19.99,
  stock_quantity: 50,
  min_stock: 10,
  image_url: 'https://example.com/image.jpg'
};

describe('Products Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createProduct', () => {
    it('should create a product successfully', async () => {
      const category = await createTestCategory();
      const input = { ...testProductInput, category_id: category.id };

      const result = await createProduct(input);

      expect(result.name).toEqual('Test Product');
      expect(result.description).toEqual('A product for testing');
      expect(result.barcode).toEqual('TEST123');
      expect(result.category_id).toEqual(category.id);
      expect(result.purchase_price).toEqual(10.00);
      expect(result.selling_price).toEqual(19.99);
      expect(result.stock_quantity).toEqual(50);
      expect(result.min_stock).toEqual(10);
      expect(result.image_url).toEqual('https://example.com/image.jpg');
      expect(result.is_active).toEqual(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create product with null values', async () => {
      const category = await createTestCategory();
      const input: CreateProductInput = {
        name: 'Basic Product',
        description: null,
        barcode: null,
        category_id: category.id,
        purchase_price: 5.00,
        selling_price: 10.00,
        stock_quantity: 0,
        min_stock: 0,
        image_url: null
      };

      const result = await createProduct(input);

      expect(result.name).toEqual('Basic Product');
      expect(result.description).toBeNull();
      expect(result.barcode).toBeNull();
      expect(result.image_url).toBeNull();
      expect(result.purchase_price).toEqual(5.00);
      expect(result.selling_price).toEqual(10.00);
    });

    it('should save product to database correctly', async () => {
      const category = await createTestCategory();
      const input = { ...testProductInput, category_id: category.id };

      const result = await createProduct(input);

      const products = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, result.id))
        .execute();

      expect(products).toHaveLength(1);
      expect(products[0].name).toEqual('Test Product');
      expect(parseFloat(products[0].purchase_price)).toEqual(10.00);
      expect(parseFloat(products[0].selling_price)).toEqual(19.99);
    });

    it('should throw error for non-existent category', async () => {
      const input = { ...testProductInput, category_id: 999 };

      await expect(createProduct(input)).rejects.toThrow(/Category with ID 999 does not exist/i);
    });

    it('should throw error for duplicate barcode', async () => {
      const category = await createTestCategory();
      const input = { ...testProductInput, category_id: category.id };

      // Create first product
      await createProduct(input);

      // Try to create second product with same barcode
      const duplicateInput = { ...input, name: 'Duplicate Product' };
      await expect(createProduct(duplicateInput)).rejects.toThrow(/Product with barcode TEST123 already exists/i);
    });

    it('should allow products without barcode', async () => {
      const category = await createTestCategory();
      const input = { ...testProductInput, category_id: category.id, barcode: null };

      const result = await createProduct(input);

      expect(result.barcode).toBeNull();
      expect(result.id).toBeDefined();
    });
  });

  describe('getProducts', () => {
    it('should return empty results when no products exist', async () => {
      const result = await getProducts();

      expect(result.products).toHaveLength(0);
      expect(result.total).toEqual(0);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(result.total_pages).toEqual(0);
    });

    it('should return products with default pagination', async () => {
      const category = await createTestCategory();
      
      // Create multiple products
      for (let i = 1; i <= 15; i++) {
        await createProduct({
          ...testProductInput,
          name: `Product ${i}`,
          barcode: `TEST${i}`,
          category_id: category.id
        });
      }

      const result = await getProducts();

      expect(result.products).toHaveLength(10); // Default limit
      expect(result.total).toEqual(15);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(result.total_pages).toEqual(2);
      
      // Check that products are ordered by created_at desc
      expect(result.products[0].name).toEqual('Product 15'); // Most recent
    });

    it('should filter by search query (name)', async () => {
      const category = await createTestCategory();
      await createProduct({ ...testProductInput, name: 'Apple iPhone', category_id: category.id });
      await createProduct({ ...testProductInput, name: 'Samsung Galaxy', barcode: 'SAM123', category_id: category.id });

      const result = await getProducts({ query: 'iPhone' });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].name).toEqual('Apple iPhone');
    });

    it('should filter by search query (barcode)', async () => {
      const category = await createTestCategory();
      await createProduct({ ...testProductInput, barcode: 'APPLE123', category_id: category.id });
      await createProduct({ ...testProductInput, name: 'Product 2', barcode: 'SAM123', category_id: category.id });

      const result = await getProducts({ query: 'APPLE' });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].barcode).toEqual('APPLE123');
    });

    it('should filter by category_id', async () => {
      const category1 = await createTestCategory();
      const category2 = await db.insert(categoriesTable)
        .values({ name: 'Category 2', description: 'Second category' })
        .returning()
        .execute()
        .then(result => result[0]);

      await createProduct({ ...testProductInput, category_id: category1.id });
      await createProduct({ ...testProductInput, name: 'Product 2', barcode: 'TEST2', category_id: category2.id });

      const result = await getProducts({ category_id: category1.id });

      expect(result.products).toHaveLength(1);
      expect(result.products[0].category_id).toEqual(category1.id);
    });

    it('should handle pagination correctly', async () => {
      const category = await createTestCategory();
      
      // Create 25 products
      for (let i = 1; i <= 25; i++) {
        await createProduct({
          ...testProductInput,
          name: `Product ${i}`,
          barcode: `TEST${i}`,
          category_id: category.id
        });
      }

      const page2 = await getProducts({ page: 2, limit: 10 });

      expect(page2.products).toHaveLength(10);
      expect(page2.page).toEqual(2);
      expect(page2.total).toEqual(25);
      expect(page2.total_pages).toEqual(3);

      const page3 = await getProducts({ page: 3, limit: 10 });
      expect(page3.products).toHaveLength(5); // Remaining products
    });

    it('should not return inactive products', async () => {
      const category = await createTestCategory();
      const product = await createProduct({ ...testProductInput, category_id: category.id });

      // Deactivate product
      await db.update(productsTable)
        .set({ is_active: false })
        .where(eq(productsTable.id, product.id))
        .execute();

      const result = await getProducts();

      expect(result.products).toHaveLength(0);
      expect(result.total).toEqual(0);
    });

    it('should convert numeric fields correctly', async () => {
      const category = await createTestCategory();
      await createProduct({ ...testProductInput, category_id: category.id });

      const result = await getProducts();

      expect(typeof result.products[0].purchase_price).toBe('number');
      expect(typeof result.products[0].selling_price).toBe('number');
      expect(result.products[0].purchase_price).toEqual(10.00);
      expect(result.products[0].selling_price).toEqual(19.99);
    });
  });

  describe('getProductById', () => {
    it('should return product by id', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const result = await getProductById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Product');
      expect(typeof result!.purchase_price).toBe('number');
      expect(typeof result!.selling_price).toBe('number');
    });

    it('should return null for non-existent product', async () => {
      const result = await getProductById(999);

      expect(result).toBeNull();
    });

    it('should return null for inactive product', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      // Deactivate product
      await db.update(productsTable)
        .set({ is_active: false })
        .where(eq(productsTable.id, created.id))
        .execute();

      const result = await getProductById(created.id);

      expect(result).toBeNull();
    });
  });

  describe('getProductByBarcode', () => {
    it('should return product by barcode', async () => {
      const category = await createTestCategory();
      await createProduct({ ...testProductInput, category_id: category.id });

      const result = await getProductByBarcode('TEST123');

      expect(result).not.toBeNull();
      expect(result!.barcode).toEqual('TEST123');
      expect(result!.name).toEqual('Test Product');
      expect(typeof result!.purchase_price).toBe('number');
    });

    it('should return null for non-existent barcode', async () => {
      const result = await getProductByBarcode('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should return null for inactive product', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      // Deactivate product
      await db.update(productsTable)
        .set({ is_active: false })
        .where(eq(productsTable.id, created.id))
        .execute();

      const result = await getProductByBarcode('TEST123');

      expect(result).toBeNull();
    });
  });

  describe('updateProduct', () => {
    it('should update product fields', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const updateInput: UpdateProductInput = {
        id: created.id,
        name: 'Updated Product',
        purchase_price: 15.00,
        selling_price: 29.99,
        stock_quantity: 75
      };

      const result = await updateProduct(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Product');
      expect(result.purchase_price).toEqual(15.00);
      expect(result.selling_price).toEqual(29.99);
      expect(result.stock_quantity).toEqual(75);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update only provided fields', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const updateInput: UpdateProductInput = {
        id: created.id,
        name: 'Partially Updated'
      };

      const result = await updateProduct(updateInput);

      expect(result.name).toEqual('Partially Updated');
      expect(result.description).toEqual(created.description); // Should remain unchanged
      expect(result.purchase_price).toEqual(created.purchase_price);
    });

    it('should throw error for non-existent product', async () => {
      const updateInput: UpdateProductInput = {
        id: 999,
        name: 'Updated'
      };

      await expect(updateProduct(updateInput)).rejects.toThrow(/Product with ID 999 not found/i);
    });

    it('should throw error for non-existent category', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const updateInput: UpdateProductInput = {
        id: created.id,
        category_id: 999
      };

      await expect(updateProduct(updateInput)).rejects.toThrow(/Category with ID 999 does not exist/i);
    });

    it('should throw error for duplicate barcode', async () => {
      const category = await createTestCategory();
      const product1 = await createProduct({ ...testProductInput, category_id: category.id });
      const product2 = await createProduct({ 
        ...testProductInput, 
        name: 'Product 2', 
        barcode: 'TEST456', 
        category_id: category.id 
      });

      const updateInput: UpdateProductInput = {
        id: product2.id,
        barcode: 'TEST123' // Trying to use product1's barcode
      };

      await expect(updateProduct(updateInput)).rejects.toThrow(/Product with barcode TEST123 already exists/i);
    });

    it('should allow updating to same barcode', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const updateInput: UpdateProductInput = {
        id: created.id,
        barcode: 'TEST123', // Same barcode
        name: 'Updated Name'
      };

      const result = await updateProduct(updateInput);

      expect(result.barcode).toEqual('TEST123');
      expect(result.name).toEqual('Updated Name');
    });

    it('should persist updates to database', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      await updateProduct({
        id: created.id,
        name: 'Database Updated',
        purchase_price: 20.00
      });

      const dbProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, created.id))
        .execute();

      expect(dbProduct[0].name).toEqual('Database Updated');
      expect(parseFloat(dbProduct[0].purchase_price)).toEqual(20.00);
    });
  });

  describe('deleteProduct', () => {
    it('should soft delete product', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const result = await deleteProduct(created.id);

      expect(result).toBe(true);

      // Check that product is marked as inactive
      const dbProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, created.id))
        .execute();

      expect(dbProduct[0].is_active).toBe(false);
    });

    it('should return false for non-existent product', async () => {
      const result = await deleteProduct(999);

      expect(result).toBe(false);
    });

    it('should not physically delete product', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      await deleteProduct(created.id);

      // Product should still exist in database
      const dbProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, created.id))
        .execute();

      expect(dbProduct).toHaveLength(1);
      expect(dbProduct[0].is_active).toBe(false);
    });
  });

  describe('getLowStockProducts', () => {
    it('should return products with low stock', async () => {
      const category = await createTestCategory();
      
      // Create products with different stock levels
      await createProduct({ 
        ...testProductInput, 
        name: 'Low Stock Product 1',
        barcode: 'LOW1',
        stock_quantity: 5, 
        min_stock: 10,
        category_id: category.id 
      });
      
      await createProduct({ 
        ...testProductInput, 
        name: 'Normal Stock Product',
        barcode: 'NORMAL1',
        stock_quantity: 50, 
        min_stock: 10,
        category_id: category.id 
      });
      
      await createProduct({ 
        ...testProductInput, 
        name: 'Low Stock Product 2',
        barcode: 'LOW2',
        stock_quantity: 10, 
        min_stock: 10, // Equal to min_stock should be included
        category_id: category.id 
      });

      const result = await getLowStockProducts();

      expect(result).toHaveLength(2);
      expect(result.find(p => p.name === 'Low Stock Product 1')).toBeDefined();
      expect(result.find(p => p.name === 'Low Stock Product 2')).toBeDefined();
      expect(result.find(p => p.name === 'Normal Stock Product')).toBeUndefined();
    });

    it('should return empty array when no low stock products', async () => {
      const category = await createTestCategory();
      await createProduct({ 
        ...testProductInput, 
        stock_quantity: 50, 
        min_stock: 10,
        category_id: category.id 
      });

      const result = await getLowStockProducts();

      expect(result).toHaveLength(0);
    });

    it('should not return inactive products', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ 
        ...testProductInput, 
        stock_quantity: 5, 
        min_stock: 10,
        category_id: category.id 
      });

      // Deactivate product
      await db.update(productsTable)
        .set({ is_active: false })
        .where(eq(productsTable.id, created.id))
        .execute();

      const result = await getLowStockProducts();

      expect(result).toHaveLength(0);
    });

    it('should convert numeric fields correctly', async () => {
      const category = await createTestCategory();
      await createProduct({ 
        ...testProductInput, 
        stock_quantity: 5, 
        min_stock: 10,
        category_id: category.id 
      });

      const result = await getLowStockProducts();

      expect(result).toHaveLength(1);
      expect(typeof result[0].purchase_price).toBe('number');
      expect(typeof result[0].selling_price).toBe('number');
    });
  });

  describe('updateProductStock', () => {
    it('should update product stock quantity', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const result = await updateProductStock(created.id, 100);

      expect(result.id).toEqual(created.id);
      expect(result.stock_quantity).toEqual(100);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent product', async () => {
      await expect(updateProductStock(999, 100)).rejects.toThrow(/Product with ID 999 not found/i);
    });

    it('should persist stock update to database', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      await updateProductStock(created.id, 75);

      const dbProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, created.id))
        .execute();

      expect(dbProduct[0].stock_quantity).toEqual(75);
    });

    it('should convert numeric fields correctly', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const result = await updateProductStock(created.id, 80);

      expect(typeof result.purchase_price).toBe('number');
      expect(typeof result.selling_price).toBe('number');
      expect(result.purchase_price).toEqual(10.00);
      expect(result.selling_price).toEqual(19.99);
    });

    it('should allow setting stock to zero', async () => {
      const category = await createTestCategory();
      const created = await createProduct({ ...testProductInput, category_id: category.id });

      const result = await updateProductStock(created.id, 0);

      expect(result.stock_quantity).toEqual(0);
    });
  });
});