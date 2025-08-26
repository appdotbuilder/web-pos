import { db } from '../db';
import { productsTable, categoriesTable } from '../db/schema';
import { 
  type CreateProductInput, 
  type UpdateProductInput, 
  type ProductSearchInput,
  type Product,
  type PaginatedProducts 
} from '../schema';
import { eq, ilike, or, and, lte, count, desc, SQL } from 'drizzle-orm';

// Handler to create a new product
export async function createProduct(input: CreateProductInput): Promise<Product> {
  try {
    // Validate that category exists
    const categoryExists = await db.select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, input.category_id))
      .execute();
    
    if (categoryExists.length === 0) {
      throw new Error(`Category with ID ${input.category_id} does not exist`);
    }

    // Check if barcode is unique (if provided)
    if (input.barcode) {
      const existingProduct = await db.select()
        .from(productsTable)
        .where(eq(productsTable.barcode, input.barcode))
        .execute();
      
      if (existingProduct.length > 0) {
        throw new Error(`Product with barcode ${input.barcode} already exists`);
      }
    }

    // Insert product record
    const result = await db.insert(productsTable)
      .values({
        name: input.name,
        description: input.description,
        barcode: input.barcode,
        category_id: input.category_id,
        purchase_price: input.purchase_price.toString(),
        selling_price: input.selling_price.toString(),
        stock_quantity: input.stock_quantity,
        min_stock: input.min_stock,
        image_url: input.image_url,
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const product = result[0];
    return {
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    };
  } catch (error) {
    console.error('Product creation failed:', error);
    throw error;
  }
}

// Handler to get all products with pagination and filtering
export async function getProducts(input?: ProductSearchInput): Promise<PaginatedProducts> {
  try {
    const page = input?.page || 1;
    const limit = input?.limit || 10;
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    
    // Only show active products by default
    conditions.push(eq(productsTable.is_active, true));

    if (input?.query) {
      conditions.push(
        or(
          ilike(productsTable.name, `%${input.query}%`),
          ilike(productsTable.barcode, `%${input.query}%`)
        )!
      );
    }

    if (input?.category_id) {
      conditions.push(eq(productsTable.category_id, input.category_id));
    }

    if (input?.barcode) {
      conditions.push(eq(productsTable.barcode, input.barcode));
    }

    // Build main query
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    
    const results = await db.select()
      .from(productsTable)
      .where(whereClause)
      .orderBy(desc(productsTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    // Get total count for pagination
    const totalResult = await db.select({ count: count() })
      .from(productsTable)
      .where(whereClause)
      .execute();
    
    const total = totalResult[0].count;

    // Convert numeric fields
    const products = results.map(product => ({
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    }));

    return {
      products,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Product search failed:', error);
    throw error;
  }
}

// Handler to get product by ID
export async function getProductById(id: number): Promise<Product | null> {
  try {
    const result = await db.select()
      .from(productsTable)
      .where(and(
        eq(productsTable.id, id),
        eq(productsTable.is_active, true)
      ))
      .execute();

    if (result.length === 0) {
      return null;
    }

    const product = result[0];
    return {
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    };
  } catch (error) {
    console.error('Get product by ID failed:', error);
    throw error;
  }
}

// Handler to get product by barcode (for barcode scanning)
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  try {
    const result = await db.select()
      .from(productsTable)
      .where(and(
        eq(productsTable.barcode, barcode),
        eq(productsTable.is_active, true)
      ))
      .execute();

    if (result.length === 0) {
      return null;
    }

    const product = result[0];
    return {
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    };
  } catch (error) {
    console.error('Get product by barcode failed:', error);
    throw error;
  }
}

// Handler to update product
export async function updateProduct(input: UpdateProductInput): Promise<Product> {
  try {
    // Check if product exists
    const existingProduct = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, input.id))
      .execute();

    if (existingProduct.length === 0) {
      throw new Error(`Product with ID ${input.id} not found`);
    }

    // Validate category if provided
    if (input.category_id) {
      const categoryExists = await db.select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, input.category_id))
        .execute();
      
      if (categoryExists.length === 0) {
        throw new Error(`Category with ID ${input.category_id} does not exist`);
      }
    }

    // Check barcode uniqueness if provided
    if (input.barcode) {
      const existingBarcode = await db.select()
        .from(productsTable)
        .where(and(
          eq(productsTable.barcode, input.barcode),
          eq(productsTable.id, input.id) // Exclude current product
        ))
        .execute();
      
      // Check if barcode exists for other products
      const otherProductWithBarcode = await db.select()
        .from(productsTable)
        .where(and(
          eq(productsTable.barcode, input.barcode),
          eq(productsTable.id, input.id) // This should NOT equal current product ID
        ))
        .execute();

      // Actually, let's check properly - if barcode exists and it's not this product
      const barcodeConflict = await db.select()
        .from(productsTable)
        .where(eq(productsTable.barcode, input.barcode))
        .execute();
      
      if (barcodeConflict.length > 0 && barcodeConflict[0].id !== input.id) {
        throw new Error(`Product with barcode ${input.barcode} already exists`);
      }
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.barcode !== undefined) updateData.barcode = input.barcode;
    if (input.category_id !== undefined) updateData.category_id = input.category_id;
    if (input.purchase_price !== undefined) updateData.purchase_price = input.purchase_price.toString();
    if (input.selling_price !== undefined) updateData.selling_price = input.selling_price.toString();
    if (input.stock_quantity !== undefined) updateData.stock_quantity = input.stock_quantity;
    if (input.min_stock !== undefined) updateData.min_stock = input.min_stock;
    if (input.image_url !== undefined) updateData.image_url = input.image_url;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    // Update product
    const result = await db.update(productsTable)
      .set(updateData)
      .where(eq(productsTable.id, input.id))
      .returning()
      .execute();

    const product = result[0];
    return {
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    };
  } catch (error) {
    console.error('Product update failed:', error);
    throw error;
  }
}

// Handler to delete product (soft delete by setting is_active to false)
export async function deleteProduct(id: number): Promise<boolean> {
  try {
    // Check if product exists
    const existingProduct = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .execute();

    if (existingProduct.length === 0) {
      return false;
    }

    // Soft delete by setting is_active to false
    await db.update(productsTable)
      .set({ 
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(productsTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Product deletion failed:', error);
    throw error;
  }
}

// Handler to get low stock products (for dashboard alerts)
export async function getLowStockProducts(): Promise<Product[]> {
  try {
    const result = await db.select()
      .from(productsTable)
      .where(and(
        lte(productsTable.stock_quantity, productsTable.min_stock),
        eq(productsTable.is_active, true)
      ))
      .orderBy(desc(productsTable.created_at))
      .execute();

    return result.map(product => ({
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    }));
  } catch (error) {
    console.error('Get low stock products failed:', error);
    throw error;
  }
}

// Handler to update product stock (for inventory management)
export async function updateProductStock(id: number, newQuantity: number): Promise<Product> {
  try {
    // Check if product exists
    const existingProduct = await db.select()
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .execute();

    if (existingProduct.length === 0) {
      throw new Error(`Product with ID ${id} not found`);
    }

    // Update stock quantity
    const result = await db.update(productsTable)
      .set({
        stock_quantity: newQuantity,
        updated_at: new Date()
      })
      .where(eq(productsTable.id, id))
      .returning()
      .execute();

    const product = result[0];
    return {
      ...product,
      purchase_price: parseFloat(product.purchase_price),
      selling_price: parseFloat(product.selling_price)
    };
  } catch (error) {
    console.error('Product stock update failed:', error);
    throw error;
  }
}