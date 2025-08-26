import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  categoriesTable, 
  productsTable, 
  transactionsTable, 
  transactionItemsTable 
} from '../db/schema';
import { type GenerateReceiptInput } from '../schema';
import { generateReceipt, generateThermalReceipt } from '../handlers/receipts';

describe('Receipt Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testCategoryId: number;
  let testProductId: number;
  let testTransactionId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        username: 'testcashier',
        email: 'cashier@test.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test Cashier',
        is_active: true
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test category
    const categoryResult = await db.insert(categoriesTable)
      .values({
        name: 'Test Category',
        description: 'Category for testing'
      })
      .returning()
      .execute();
    testCategoryId = categoryResult[0].id;

    // Create test product
    const productResult = await db.insert(productsTable)
      .values({
        name: 'Test Product',
        description: 'Product for testing',
        barcode: '123456789',
        category_id: testCategoryId,
        purchase_price: '10.00',
        selling_price: '15.99',
        stock_quantity: 100,
        min_stock: 10
      })
      .returning()
      .execute();
    testProductId = productResult[0].id;

    // Create test transaction
    const transactionResult = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN-001',
        user_id: testUserId,
        customer_name: 'John Doe',
        subtotal: '31.98',
        discount_percentage: '5.00',
        discount_amount: '1.60',
        tax_percentage: '10.00',
        tax_amount: '3.04',
        total_amount: '33.42',
        payment_method: 'cash',
        payment_amount: '40.00',
        change_amount: '6.58',
        status: 'completed'
      })
      .returning()
      .execute();
    testTransactionId = transactionResult[0].id;

    // Create test transaction items
    await db.insert(transactionItemsTable)
      .values([
        {
          transaction_id: testTransactionId,
          product_id: testProductId,
          product_name: 'Test Product',
          quantity: 2,
          unit_price: '15.99',
          total_price: '31.98'
        }
      ])
      .execute();
  });

  describe('generateReceipt', () => {
    it('should generate PDF receipt for valid transaction', async () => {
      const input: GenerateReceiptInput = {
        transaction_id: testTransactionId,
        format: 'pdf'
      };

      const result = await generateReceipt(input);

      expect(result).toBeDefined();
      expect(result.url).toMatch(/^\/receipts\/receipt-TXN-001-\d+\.pdf$/);
      expect(result.filename).toMatch(/^receipt-TXN-001-\d+\.pdf$/);
    });

    it('should generate PDF receipt without format specified', async () => {
      const input: GenerateReceiptInput = {
        transaction_id: testTransactionId
      };

      const result = await generateReceipt(input);

      expect(result).toBeDefined();
      expect(result.url).toMatch(/^\/receipts\/receipt-TXN-001-\d+\.pdf$/);
      expect(result.filename).toMatch(/^receipt-TXN-001-\d+\.pdf$/);
    });

    it('should throw error for non-existent transaction', async () => {
      const input: GenerateReceiptInput = {
        transaction_id: 99999,
        format: 'pdf'
      };

      expect(generateReceipt(input)).rejects.toThrow(/Transaction with ID 99999 not found/i);
    });

    it('should include transaction number in filename', async () => {
      const input: GenerateReceiptInput = {
        transaction_id: testTransactionId,
        format: 'pdf'
      };

      const result = await generateReceipt(input);

      expect(result.filename).toContain('TXN-001');
      expect(result.url).toContain('TXN-001');
    });
  });

  describe('generateThermalReceipt', () => {
    it('should generate thermal receipt format for valid transaction', async () => {
      const result = await generateThermalReceipt(testTransactionId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      // Check for key receipt elements
      expect(result).toContain('POS SYSTEM STORE');
      expect(result).toContain('TXN-001');
      expect(result).toContain('Test Cashier');
      expect(result).toContain('John Doe');
      expect(result).toContain('Test Product');
      expect(result).toContain('Thank you for shopping!');
    });

    it('should format transaction details correctly', async () => {
      const result = await generateThermalReceipt(testTransactionId);

      // Check transaction details
      expect(result).toMatch(/Transaction: TXN-001/);
      expect(result).toMatch(/Cashier: Test Cashier/);
      expect(result).toMatch(/Customer: John Doe/);

      // Check amounts formatting
      expect(result).toContain('$31.98'); // subtotal
      expect(result).toContain('$33.42'); // total
      expect(result).toContain('$40.00'); // payment
      expect(result).toContain('$6.58');  // change
      expect(result).toContain('$1.60');  // discount
      expect(result).toContain('$3.04');  // tax
    });

    it('should format items correctly with proper alignment', async () => {
      const result = await generateThermalReceipt(testTransactionId);

      // Check item formatting
      expect(result).toMatch(/Test Product\s+2x\s+\$15\.99\s+\$31\.98/);
      
      // Check headers are present
      expect(result).toContain('ITEM                QTY   PRICE  TOTAL');
      expect(result).toContain('-------------------------------------');
    });

    it('should handle long product names by truncating', async () => {
      // Create product with very long name
      const longProductResult = await db.insert(productsTable)
        .values({
          name: 'This Is A Very Long Product Name That Should Be Truncated',
          category_id: testCategoryId,
          purchase_price: '5.00',
          selling_price: '7.50',
          stock_quantity: 50,
          min_stock: 5
        })
        .returning()
        .execute();

      // Add item with long name to transaction
      await db.insert(transactionItemsTable)
        .values({
          transaction_id: testTransactionId,
          product_id: longProductResult[0].id,
          product_name: 'This Is A Very Long Product Name That Should Be Truncated',
          quantity: 1,
          unit_price: '7.50',
          total_price: '7.50'
        })
        .execute();

      const result = await generateThermalReceipt(testTransactionId);

      // Should contain truncated name with ellipsis
      expect(result).toContain('This Is A Ver...');
      // Should not contain the full long name
      expect(result).not.toContain('This Is A Very Long Product Name That Should Be Truncated');
    });

    it('should handle transaction without customer name', async () => {
      // Create transaction without customer name
      const transactionResult = await db.insert(transactionsTable)
        .values({
          transaction_number: 'TXN-002',
          user_id: testUserId,
          customer_name: null,
          subtotal: '15.99',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          tax_percentage: '0.00',
          tax_amount: '0.00',
          total_amount: '15.99',
          payment_method: 'card',
          payment_amount: '15.99',
          change_amount: '0.00',
          status: 'completed'
        })
        .returning()
        .execute();

      await db.insert(transactionItemsTable)
        .values({
          transaction_id: transactionResult[0].id,
          product_id: testProductId,
          product_name: 'Test Product',
          quantity: 1,
          unit_price: '15.99',
          total_price: '15.99'
        })
        .execute();

      const result = await generateThermalReceipt(transactionResult[0].id);

      expect(result).toContain('TXN-002');
      expect(result).toContain('Test Cashier');
      expect(result).not.toContain('Customer:');
    });

    it('should handle zero discount and tax amounts', async () => {
      // Create transaction with no discount or tax
      const transactionResult = await db.insert(transactionsTable)
        .values({
          transaction_number: 'TXN-003',
          user_id: testUserId,
          customer_name: 'Jane Smith',
          subtotal: '15.99',
          discount_percentage: '0.00',
          discount_amount: '0.00',
          tax_percentage: '0.00',
          tax_amount: '0.00',
          total_amount: '15.99',
          payment_method: 'cash',
          payment_amount: '20.00',
          change_amount: '4.01',
          status: 'completed'
        })
        .returning()
        .execute();

      await db.insert(transactionItemsTable)
        .values({
          transaction_id: transactionResult[0].id,
          product_id: testProductId,
          product_name: 'Test Product',
          quantity: 1,
          unit_price: '15.99',
          total_price: '15.99'
        })
        .execute();

      const result = await generateThermalReceipt(transactionResult[0].id);

      // Should not show discount or tax lines when they are zero
      expect(result).not.toContain('Discount:');
      expect(result).not.toContain('Tax:');
      expect(result).toContain('Subtotal: $15.99');
      expect(result).toContain('TOTAL: $15.99');
      expect(result).toContain('CHANGE:  $4.01');
    });

    it('should throw error for non-existent transaction', async () => {
      expect(generateThermalReceipt(99999)).rejects.toThrow(/Transaction with ID 99999 not found/i);
    });

    it('should include proper date and time formatting', async () => {
      const result = await generateThermalReceipt(testTransactionId);
      
      // Should contain date and time in proper format
      expect(result).toMatch(/Date: \d{2}\/\d{2}\/\d{4}/);
      expect(result).toMatch(/Time: \d{1,2}:\d{2}:\d{2}\s*(AM|PM)/);
    });

    it('should format payment method correctly', async () => {
      const result = await generateThermalReceipt(testTransactionId);
      
      // Payment method should be uppercase
      expect(result).toContain('CASH: $40.00');
    });
  });
});