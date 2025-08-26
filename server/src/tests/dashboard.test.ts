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
  getDashboardSummary, 
  getRecentTransactions, 
  getTopSellingProducts 
} from '../handlers/dashboard';

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getDashboardSummary', () => {
    it('should return empty summary when no data exists', async () => {
      const summary = await getDashboardSummary();
      
      expect(summary.total_sales_today).toEqual(0);
      expect(summary.total_transactions_today).toEqual(0);
      expect(summary.low_stock_products).toEqual(0);
      expect(summary.total_revenue_month).toEqual(0);
    });

    it('should calculate today sales and transactions correctly', async () => {
      // Create prerequisites
      const user = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test User'
      }).returning().execute();

      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category'
      }).returning().execute();

      const product = await db.insert(productsTable).values({
        name: 'Test Product',
        category_id: category[0].id,
        purchase_price: '10.00',
        selling_price: '15.00',
        stock_quantity: 100,
        min_stock: 10
      }).returning().execute();

      // Create today's completed transaction
      const today = new Date();
      const transaction = await db.insert(transactionsTable).values({
        transaction_number: 'TXN001',
        user_id: user[0].id,
        subtotal: '100.00',
        total_amount: '100.00',
        payment_method: 'cash',
        payment_amount: '100.00',
        status: 'completed',
        created_at: today
      }).returning().execute();

      // Create another completed transaction
      await db.insert(transactionsTable).values({
        transaction_number: 'TXN002',
        user_id: user[0].id,
        subtotal: '50.00',
        total_amount: '50.00',
        payment_method: 'cash',
        payment_amount: '50.00',
        status: 'completed',
        created_at: today
      }).returning().execute();

      // Create a pending transaction (should not be counted)
      await db.insert(transactionsTable).values({
        transaction_number: 'TXN003',
        user_id: user[0].id,
        subtotal: '25.00',
        total_amount: '25.00',
        payment_method: 'cash',
        payment_amount: '25.00',
        status: 'pending',
        created_at: today
      }).returning().execute();

      const summary = await getDashboardSummary();

      expect(summary.total_sales_today).toEqual(150);
      expect(summary.total_transactions_today).toEqual(2);
      expect(summary.total_revenue_month).toEqual(150);
    });

    it('should count low stock products correctly', async () => {
      // Create category
      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category'
      }).returning().execute();

      // Create product with stock below minimum (low stock)
      await db.insert(productsTable).values({
        name: 'Low Stock Product',
        category_id: category[0].id,
        purchase_price: '10.00',
        selling_price: '15.00',
        stock_quantity: 5,
        min_stock: 10
      }).returning().execute();

      // Create product with stock equal to minimum (low stock)
      await db.insert(productsTable).values({
        name: 'Equal Stock Product',
        category_id: category[0].id,
        purchase_price: '10.00',
        selling_price: '15.00',
        stock_quantity: 10,
        min_stock: 10
      }).returning().execute();

      // Create product with sufficient stock
      await db.insert(productsTable).values({
        name: 'Good Stock Product',
        category_id: category[0].id,
        purchase_price: '10.00',
        selling_price: '15.00',
        stock_quantity: 20,
        min_stock: 10
      }).returning().execute();

      // Create inactive product with low stock (should not be counted)
      await db.insert(productsTable).values({
        name: 'Inactive Low Stock Product',
        category_id: category[0].id,
        purchase_price: '10.00',
        selling_price: '15.00',
        stock_quantity: 2,
        min_stock: 10,
        is_active: false
      }).returning().execute();

      const summary = await getDashboardSummary();

      expect(summary.low_stock_products).toEqual(2); // Only active products with stock <= min_stock
    });

    it('should calculate monthly revenue correctly', async () => {
      // Create prerequisites
      const user = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test User'
      }).returning().execute();

      const currentMonth = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Create transaction from current month
      await db.insert(transactionsTable).values({
        transaction_number: 'TXN001',
        user_id: user[0].id,
        subtotal: '200.00',
        total_amount: '200.00',
        payment_method: 'cash',
        payment_amount: '200.00',
        status: 'completed',
        created_at: currentMonth
      }).returning().execute();

      // Create transaction from last month (should not be included)
      await db.insert(transactionsTable).values({
        transaction_number: 'TXN002',
        user_id: user[0].id,
        subtotal: '100.00',
        total_amount: '100.00',
        payment_method: 'cash',
        payment_amount: '100.00',
        status: 'completed',
        created_at: lastMonth
      }).returning().execute();

      const summary = await getDashboardSummary();

      expect(summary.total_revenue_month).toEqual(200);
    });
  });

  describe('getRecentTransactions', () => {
    it('should return empty array when no transactions exist', async () => {
      const transactions = await getRecentTransactions();
      
      expect(transactions).toHaveLength(0);
    });

    it('should return recent transactions ordered by creation date', async () => {
      // Create user
      const user = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test User'
      }).returning().execute();

      const baseDate = new Date();
      
      // Create transactions with different timestamps
      await db.insert(transactionsTable).values({
        transaction_number: 'TXN001',
        user_id: user[0].id,
        subtotal: '100.00',
        total_amount: '100.00',
        payment_method: 'cash',
        payment_amount: '100.00',
        status: 'completed',
        created_at: new Date(baseDate.getTime() - 3600000) // 1 hour ago
      }).returning().execute();

      await db.insert(transactionsTable).values({
        transaction_number: 'TXN002',
        user_id: user[0].id,
        subtotal: '200.00',
        total_amount: '200.00',
        payment_method: 'card',
        payment_amount: '200.00',
        status: 'completed',
        created_at: new Date(baseDate.getTime() - 1800000) // 30 minutes ago
      }).returning().execute();

      await db.insert(transactionsTable).values({
        transaction_number: 'TXN003',
        user_id: user[0].id,
        subtotal: '50.00',
        total_amount: '50.00',
        payment_method: 'cash',
        payment_amount: '50.00',
        status: 'pending',
        created_at: baseDate // Now
      }).returning().execute();

      const transactions = await getRecentTransactions(2);

      expect(transactions).toHaveLength(2);
      expect(transactions[0].transaction_number).toEqual('TXN003');
      expect(transactions[1].transaction_number).toEqual('TXN002');
      expect(typeof transactions[0].total_amount).toEqual('number');
      expect(transactions[0].total_amount).toEqual(50);
    });

    it('should limit results correctly', async () => {
      // Create user
      const user = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test User'
      }).returning().execute();

      // Create multiple transactions
      for (let i = 1; i <= 10; i++) {
        await db.insert(transactionsTable).values({
          transaction_number: `TXN${i.toString().padStart(3, '0')}`,
          user_id: user[0].id,
          subtotal: '10.00',
          total_amount: '10.00',
          payment_method: 'cash',
          payment_amount: '10.00',
          status: 'completed'
        }).returning().execute();
      }

      const transactions = await getRecentTransactions(3);

      expect(transactions).toHaveLength(3);
    });
  });

  describe('getTopSellingProducts', () => {
    it('should return empty array when no transaction items exist', async () => {
      const products = await getTopSellingProducts();
      
      expect(products).toHaveLength(0);
    });

    it('should return top selling products ordered by quantity sold', async () => {
      // Create prerequisites
      const user = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test User'
      }).returning().execute();

      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category'
      }).returning().execute();

      const product1 = await db.insert(productsTable).values({
        name: 'Product 1',
        category_id: category[0].id,
        purchase_price: '10.00',
        selling_price: '15.00',
        stock_quantity: 100,
        min_stock: 10
      }).returning().execute();

      const product2 = await db.insert(productsTable).values({
        name: 'Product 2',
        category_id: category[0].id,
        purchase_price: '20.00',
        selling_price: '25.00',
        stock_quantity: 100,
        min_stock: 10
      }).returning().execute();

      // Create completed transactions
      const transaction1 = await db.insert(transactionsTable).values({
        transaction_number: 'TXN001',
        user_id: user[0].id,
        subtotal: '100.00',
        total_amount: '100.00',
        payment_method: 'cash',
        payment_amount: '100.00',
        status: 'completed'
      }).returning().execute();

      const transaction2 = await db.insert(transactionsTable).values({
        transaction_number: 'TXN002',
        user_id: user[0].id,
        subtotal: '150.00',
        total_amount: '150.00',
        payment_method: 'cash',
        payment_amount: '150.00',
        status: 'completed'
      }).returning().execute();

      // Create pending transaction (should not be included)
      const transaction3 = await db.insert(transactionsTable).values({
        transaction_number: 'TXN003',
        user_id: user[0].id,
        subtotal: '50.00',
        total_amount: '50.00',
        payment_method: 'cash',
        payment_amount: '50.00',
        status: 'pending'
      }).returning().execute();

      // Create transaction items
      await db.insert(transactionItemsTable).values({
        transaction_id: transaction1[0].id,
        product_id: product1[0].id,
        product_name: 'Product 1',
        quantity: 5,
        unit_price: '15.00',
        total_price: '75.00'
      }).execute();

      await db.insert(transactionItemsTable).values({
        transaction_id: transaction2[0].id,
        product_id: product1[0].id,
        product_name: 'Product 1',
        quantity: 3,
        unit_price: '15.00',
        total_price: '45.00'
      }).execute();

      await db.insert(transactionItemsTable).values({
        transaction_id: transaction1[0].id,
        product_id: product2[0].id,
        product_name: 'Product 2',
        quantity: 2,
        unit_price: '25.00',
        total_price: '50.00'
      }).execute();

      // Create item for pending transaction (should not be included)
      await db.insert(transactionItemsTable).values({
        transaction_id: transaction3[0].id,
        product_id: product2[0].id,
        product_name: 'Product 2',
        quantity: 10,
        unit_price: '25.00',
        total_price: '250.00'
      }).execute();

      const topProducts = await getTopSellingProducts();

      expect(topProducts).toHaveLength(2);
      
      // Product 1 should be first (8 total quantity)
      expect(topProducts[0].product_name).toEqual('Product 1');
      expect(topProducts[0].total_quantity).toEqual(8);
      expect(topProducts[0].total_revenue).toEqual(120);
      
      // Product 2 should be second (2 total quantity, excluding pending)
      expect(topProducts[1].product_name).toEqual('Product 2');
      expect(topProducts[1].total_quantity).toEqual(2);
      expect(topProducts[1].total_revenue).toEqual(50);
    });

    it('should limit results correctly', async () => {
      // Create prerequisites
      const user = await db.insert(usersTable).values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        role: 'kasir',
        full_name: 'Test User'
      }).returning().execute();

      const category = await db.insert(categoriesTable).values({
        name: 'Test Category',
        description: 'A test category'
      }).returning().execute();

      const transaction = await db.insert(transactionsTable).values({
        transaction_number: 'TXN001',
        user_id: user[0].id,
        subtotal: '100.00',
        total_amount: '100.00',
        payment_method: 'cash',
        payment_amount: '100.00',
        status: 'completed'
      }).returning().execute();

      // Create multiple products and items
      for (let i = 1; i <= 10; i++) {
        const product = await db.insert(productsTable).values({
          name: `Product ${i}`,
          category_id: category[0].id,
          purchase_price: '10.00',
          selling_price: '15.00',
          stock_quantity: 100,
          min_stock: 10
        }).returning().execute();

        await db.insert(transactionItemsTable).values({
          transaction_id: transaction[0].id,
          product_id: product[0].id,
          product_name: `Product ${i}`,
          quantity: 11 - i, // Descending quantities for ordering test
          unit_price: '15.00',
          total_price: ((11 - i) * 15).toString()
        }).execute();
      }

      const topProducts = await getTopSellingProducts(3);

      expect(topProducts).toHaveLength(3);
      expect(topProducts[0].product_name).toEqual('Product 1');
      expect(topProducts[0].total_quantity).toEqual(10);
    });
  });
});