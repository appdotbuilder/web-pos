import { db } from '../db';
import { transactionsTable, productsTable, transactionItemsTable, usersTable } from '../db/schema';
import { type DashboardSummary, type Transaction } from '../schema';
import { eq, and, gte, lte, lt, desc, sum, count, sql } from 'drizzle-orm';

// Handler to get dashboard summary data
export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get start of current month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get today's sales and transaction count
    const todayStats = await db
      .select({
        total_sales: sum(transactionsTable.total_amount),
        transaction_count: count(transactionsTable.id)
      })
      .from(transactionsTable)
      .where(
        and(
          gte(transactionsTable.created_at, today),
          lt(transactionsTable.created_at, tomorrow),
          eq(transactionsTable.status, 'completed')
        )
      )
      .execute();

    // Get low stock products count
    const lowStockProducts = await db
      .select({
        count: count(productsTable.id)
      })
      .from(productsTable)
      .where(
        and(
          sql`${productsTable.stock_quantity} <= ${productsTable.min_stock}`,
          eq(productsTable.is_active, true)
        )
      )
      .execute();

    // Get current month's revenue
    const monthlyRevenue = await db
      .select({
        total_revenue: sum(transactionsTable.total_amount)
      })
      .from(transactionsTable)
      .where(
        and(
          gte(transactionsTable.created_at, monthStart),
          eq(transactionsTable.status, 'completed')
        )
      )
      .execute();

    const todayData = todayStats[0];
    const lowStockData = lowStockProducts[0];
    const monthlyData = monthlyRevenue[0];

    return {
      total_sales_today: parseFloat(todayData.total_sales || '0'),
      total_transactions_today: todayData.transaction_count,
      low_stock_products: lowStockData.count,
      total_revenue_month: parseFloat(monthlyData.total_revenue || '0'),
    };
  } catch (error) {
    console.error('Dashboard summary failed:', error);
    throw error;
  }
}

// Handler to get recent transactions for dashboard
export async function getRecentTransactions(limit: number = 5): Promise<Transaction[]> {
  try {
    const results = await db
      .select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit)
      .execute();

    return results.map(transaction => ({
      ...transaction,
      subtotal: parseFloat(transaction.subtotal),
      discount_percentage: parseFloat(transaction.discount_percentage),
      discount_amount: parseFloat(transaction.discount_amount),
      tax_percentage: parseFloat(transaction.tax_percentage),
      tax_amount: parseFloat(transaction.tax_amount),
      total_amount: parseFloat(transaction.total_amount),
      payment_amount: parseFloat(transaction.payment_amount),
      change_amount: parseFloat(transaction.change_amount)
    }));
  } catch (error) {
    console.error('Recent transactions fetch failed:', error);
    throw error;
  }
}

// Handler to get top selling products
export async function getTopSellingProducts(limit: number = 5): Promise<Array<{
  product_id: number;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}>> {
  try {
    const results = await db
      .select({
        product_id: transactionItemsTable.product_id,
        product_name: transactionItemsTable.product_name,
        total_quantity: sum(transactionItemsTable.quantity),
        total_revenue: sum(transactionItemsTable.total_price)
      })
      .from(transactionItemsTable)
      .innerJoin(transactionsTable, eq(transactionItemsTable.transaction_id, transactionsTable.id))
      .where(eq(transactionsTable.status, 'completed'))
      .groupBy(transactionItemsTable.product_id, transactionItemsTable.product_name)
      .orderBy(desc(sum(transactionItemsTable.quantity)))
      .limit(limit)
      .execute();

    return results.map(result => ({
      product_id: result.product_id,
      product_name: result.product_name,
      total_quantity: parseInt(result.total_quantity || '0'),
      total_revenue: parseFloat(result.total_revenue || '0')
    }));
  } catch (error) {
    console.error('Top selling products fetch failed:', error);
    throw error;
  }
}