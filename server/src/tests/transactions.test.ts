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
import { 
  type CreateTransactionInput,
  type TransactionSearchInput,
} from '../schema';
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  getTransactionByNumber,
  updateTransactionStatus,
  getTodaySalesSummary,
  getMonthlyRevenue,
} from '../handlers/transactions';
import { eq } from 'drizzle-orm';

// Test data
let testUserId: number;
let testCategoryId: number;
let testProduct1Id: number;
let testProduct2Id: number;

const setupTestData = async () => {
  // Create test user
  const userResult = await db.insert(usersTable).values({
    username: 'testuser',
    email: 'test@example.com',
    password_hash: 'hashedpassword',
    role: 'kasir',
    full_name: 'Test User',
  }).returning().execute();
  testUserId = userResult[0].id;

  // Create test category
  const categoryResult = await db.insert(categoriesTable).values({
    name: 'Test Category',
    description: 'Test category description',
  }).returning().execute();
  testCategoryId = categoryResult[0].id;

  // Create test products
  const product1Result = await db.insert(productsTable).values({
    name: 'Test Product 1',
    description: 'Test product 1 description',
    category_id: testCategoryId,
    purchase_price: '10.00',
    selling_price: '15.00',
    stock_quantity: 100,
    min_stock: 10,
  }).returning().execute();
  testProduct1Id = product1Result[0].id;

  const product2Result = await db.insert(productsTable).values({
    name: 'Test Product 2',
    description: 'Test product 2 description',
    category_id: testCategoryId,
    purchase_price: '20.00',
    selling_price: '30.00',
    stock_quantity: 50,
    min_stock: 5,
  }).returning().execute();
  testProduct2Id = product2Result[0].id;
};

const testTransactionInput: CreateTransactionInput = {
  customer_name: 'John Doe',
  items: [
    { product_id: 0, quantity: 2 }, // Will be set in test
    { product_id: 0, quantity: 1 }, // Will be set in test
  ],
  discount_percentage: 10,
  payment_method: 'cash',
  payment_amount: 50.00,
  notes: 'Test transaction',
};

describe('Transaction Handlers', () => {
  beforeEach(async () => {
    await createDB();
    await setupTestData();
    // Update test input with actual product IDs
    testTransactionInput.items[0].product_id = testProduct1Id;
    testTransactionInput.items[1].product_id = testProduct2Id;
  });

  afterEach(resetDB);

  describe('createTransaction', () => {
    it('should create a transaction with items', async () => {
      const result = await createTransaction(testTransactionInput, testUserId);

      // Basic field validation
      expect(result.id).toBeDefined();
      expect(result.transaction_number).toMatch(/^TXN-\d+-\d+$/);
      expect(result.user_id).toEqual(testUserId);
      expect(result.customer_name).toEqual('John Doe');
      expect(result.subtotal).toEqual(60); // (15 * 2) + (30 * 1)
      expect(result.discount_percentage).toEqual(10);
      expect(result.discount_amount).toEqual(6); // 60 * 10%
      expect(result.total_amount).toEqual(54); // 60 - 6
      expect(result.payment_method).toEqual('cash');
      expect(result.payment_amount).toEqual(50);
      expect(result.change_amount).toEqual(0); // payment less than total
      expect(result.status).toEqual('completed');
      expect(result.notes).toEqual('Test transaction');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create transaction items correctly', async () => {
      const transaction = await createTransaction(testTransactionInput, testUserId);

      const items = await db
        .select()
        .from(transactionItemsTable)
        .where(eq(transactionItemsTable.transaction_id, transaction.id))
        .execute();

      expect(items).toHaveLength(2);
      
      // First item
      expect(items[0].product_id).toEqual(testProduct1Id);
      expect(items[0].product_name).toEqual('Test Product 1');
      expect(items[0].quantity).toEqual(2);
      expect(parseFloat(items[0].unit_price)).toEqual(15);
      expect(parseFloat(items[0].total_price)).toEqual(30);

      // Second item
      expect(items[1].product_id).toEqual(testProduct2Id);
      expect(items[1].product_name).toEqual('Test Product 2');
      expect(items[1].quantity).toEqual(1);
      expect(parseFloat(items[1].unit_price)).toEqual(30);
      expect(parseFloat(items[1].total_price)).toEqual(30);
    });

    it('should update product stock quantities', async () => {
      await createTransaction(testTransactionInput, testUserId);

      const product1 = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, testProduct1Id))
        .execute();

      const product2 = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, testProduct2Id))
        .execute();

      expect(product1[0].stock_quantity).toEqual(98); // 100 - 2
      expect(product2[0].stock_quantity).toEqual(49); // 50 - 1
    });

    it('should throw error for non-existent product', async () => {
      const invalidInput = {
        ...testTransactionInput,
        items: [{ product_id: 99999, quantity: 1 }],
      };

      expect(createTransaction(invalidInput, testUserId)).rejects.toThrow(/Product with id 99999 not found/i);
    });

    it('should throw error for insufficient stock', async () => {
      const insufficientStockInput = {
        ...testTransactionInput,
        items: [{ product_id: testProduct1Id, quantity: 150 }], // More than available stock
      };

      expect(createTransaction(insufficientStockInput, testUserId)).rejects.toThrow(/Insufficient stock/i);
    });

    it('should calculate change amount correctly when payment exceeds total', async () => {
      const inputWithHighPayment = {
        ...testTransactionInput,
        payment_amount: 100.00,
      };

      const result = await createTransaction(inputWithHighPayment, testUserId);
      expect(result.change_amount).toEqual(46); // 100 - 54
    });
  });

  describe('getTransactions', () => {
    beforeEach(async () => {
      // Create some test transactions
      await createTransaction(testTransactionInput, testUserId);
      await createTransaction({
        ...testTransactionInput,
        customer_name: 'Jane Smith',
        payment_method: 'card',
      }, testUserId);
    });

    it('should get all transactions with pagination', async () => {
      const result = await getTransactions({ page: 1, limit: 10 });

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(result.total_pages).toEqual(1);
      
      // Check numeric field conversions
      expect(typeof result.transactions[0].subtotal).toBe('number');
      expect(typeof result.transactions[0].total_amount).toBe('number');
    });

    it('should filter transactions by transaction number', async () => {
      const allTransactions = await getTransactions();
      const transactionNumber = allTransactions.transactions[0].transaction_number;

      const result = await getTransactions({
        transaction_number: transactionNumber, // Exact match
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transaction_number).toEqual(transactionNumber);
    });

    it('should filter transactions by partial transaction number', async () => {
      const result = await getTransactions({
        transaction_number: 'TXN-', // Partial match - should find both
      });

      expect(result.transactions.length).toBeGreaterThanOrEqual(2);
      result.transactions.forEach(transaction => {
        expect(transaction.transaction_number).toMatch(/TXN-/);
      });
    });

    it('should filter transactions by user_id', async () => {
      const result = await getTransactions({ user_id: testUserId });

      expect(result.transactions).toHaveLength(2);
      result.transactions.forEach(transaction => {
        expect(transaction.user_id).toEqual(testUserId);
      });
    });

    it('should filter transactions by status', async () => {
      const result = await getTransactions({ status: 'completed' });

      expect(result.transactions).toHaveLength(2);
      result.transactions.forEach(transaction => {
        expect(transaction.status).toEqual('completed');
      });
    });

    it('should filter transactions by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await getTransactions({
        date_from: today,
        date_to: tomorrow.toISOString().split('T')[0],
      });

      expect(result.transactions.length).toBeGreaterThan(0);
      result.transactions.forEach(transaction => {
        expect(transaction.created_at).toBeInstanceOf(Date);
      });
    });

    it('should handle pagination correctly', async () => {
      const result = await getTransactions({ page: 1, limit: 1 });

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toEqual(2);
      expect(result.total_pages).toEqual(2);
    });

    it('should return empty results for non-matching filters', async () => {
      const result = await getTransactions({ status: 'cancelled' });

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toEqual(0);
    });
  });

  describe('getTransactionById', () => {
    it('should get transaction by ID with items', async () => {
      const createdTransaction = await createTransaction(testTransactionInput, testUserId);

      const result = await getTransactionById(createdTransaction.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdTransaction.id);
      expect(result!.items).toHaveLength(2);
      
      // Check numeric conversions
      expect(typeof result!.subtotal).toBe('number');
      expect(typeof result!.items[0].unit_price).toBe('number');
      expect(typeof result!.items[0].total_price).toBe('number');
    });

    it('should return null for non-existent transaction', async () => {
      const result = await getTransactionById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getTransactionByNumber', () => {
    it('should get transaction by number with items', async () => {
      const createdTransaction = await createTransaction(testTransactionInput, testUserId);

      const result = await getTransactionByNumber(createdTransaction.transaction_number);

      expect(result).not.toBeNull();
      expect(result!.transaction_number).toEqual(createdTransaction.transaction_number);
      expect(result!.items).toHaveLength(2);
      
      // Check numeric conversions
      expect(typeof result!.subtotal).toBe('number');
      expect(typeof result!.items[0].unit_price).toBe('number');
    });

    it('should return null for non-existent transaction number', async () => {
      const result = await getTransactionByNumber('NON-EXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('updateTransactionStatus', () => {
    it('should update transaction status', async () => {
      const createdTransaction = await createTransaction(testTransactionInput, testUserId);

      const result = await updateTransactionStatus(createdTransaction.id, 'pending');

      expect(result.id).toEqual(createdTransaction.id);
      expect(result.status).toEqual('pending');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should restore stock when cancelling completed transaction', async () => {
      const createdTransaction = await createTransaction(testTransactionInput, testUserId);

      // Cancel the transaction
      await updateTransactionStatus(createdTransaction.id, 'cancelled');

      // Check that stock is restored
      const product1 = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, testProduct1Id))
        .execute();

      const product2 = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, testProduct2Id))
        .execute();

      expect(product1[0].stock_quantity).toEqual(100); // Back to original
      expect(product2[0].stock_quantity).toEqual(50); // Back to original
    });

    it('should throw error for non-existent transaction', async () => {
      expect(updateTransactionStatus(99999, 'cancelled')).rejects.toThrow(/Transaction with id 99999 not found/i);
    });
  });

  describe('getTodaySalesSummary', () => {
    it('should calculate today sales summary', async () => {
      // Create transactions for today
      await createTransaction(testTransactionInput, testUserId);
      await createTransaction(testTransactionInput, testUserId);

      const result = await getTodaySalesSummary();

      expect(result.total_sales).toEqual(108); // 54 * 2
      expect(result.total_transactions).toEqual(2);
    });

    it('should return zero for days with no transactions', async () => {
      const result = await getTodaySalesSummary();

      expect(result.total_sales).toEqual(0);
      expect(result.total_transactions).toEqual(0);
    });

    it('should exclude cancelled transactions from summary', async () => {
      const transaction = await createTransaction(testTransactionInput, testUserId);
      await updateTransactionStatus(transaction.id, 'cancelled');

      const result = await getTodaySalesSummary();

      expect(result.total_sales).toEqual(0);
      expect(result.total_transactions).toEqual(0);
    });
  });

  describe('getMonthlyRevenue', () => {
    it('should calculate monthly revenue', async () => {
      // Create transactions for this month
      await createTransaction(testTransactionInput, testUserId);
      await createTransaction(testTransactionInput, testUserId);

      const result = await getMonthlyRevenue();

      expect(result).toEqual(108); // 54 * 2
    });

    it('should return zero for months with no transactions', async () => {
      const result = await getMonthlyRevenue();

      expect(result).toEqual(0);
    });

    it('should exclude cancelled transactions from monthly revenue', async () => {
      const transaction = await createTransaction(testTransactionInput, testUserId);
      await updateTransactionStatus(transaction.id, 'cancelled');

      const result = await getMonthlyRevenue();

      expect(result).toEqual(0);
    });
  });
});