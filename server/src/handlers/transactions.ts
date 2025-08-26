import { db } from '../db';
import { 
  transactionsTable, 
  transactionItemsTable, 
  productsTable, 
  usersTable 
} from '../db/schema';
import { 
  type CreateTransactionInput, 
  type TransactionSearchInput,
  type Transaction,
  type TransactionItem,
  type PaginatedTransactions 
} from '../schema';
import { eq, and, gte, lte, desc, ilike, SQL, sum, count } from 'drizzle-orm';

// Handler to create a new transaction
export async function createTransaction(input: CreateTransactionInput, userId: number): Promise<Transaction> {
  try {
    return await db.transaction(async (tx) => {
      // First, verify that all products exist and have sufficient stock
      let subtotal = 0;
      const itemsData: Array<{
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price: number;
        total_price: number;
      }> = [];

      for (const item of input.items) {
        const product = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, item.product_id))
          .execute();

        if (!product.length) {
          throw new Error(`Product with id ${item.product_id} not found`);
        }

        const productData = product[0];
        if (productData.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for product ${productData.name}. Available: ${productData.stock_quantity}, Required: ${item.quantity}`);
        }

        const unitPrice = parseFloat(productData.selling_price);
        const totalPrice = unitPrice * item.quantity;
        subtotal += totalPrice;

        itemsData.push({
          product_id: item.product_id,
          product_name: productData.name,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
        });
      }

      // Calculate amounts
      const discountAmount = (subtotal * input.discount_percentage) / 100;
      const taxAmount = 0; // No tax calculation in this implementation
      const totalAmount = subtotal - discountAmount + taxAmount;
      const changeAmount = Math.max(0, input.payment_amount - totalAmount);

      // Generate unique transaction number
      const transactionNumber = `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create transaction record
      const transactionResult = await tx
        .insert(transactionsTable)
        .values({
          transaction_number: transactionNumber,
          user_id: userId,
          customer_name: input.customer_name,
          subtotal: subtotal.toString(),
          discount_percentage: input.discount_percentage.toString(),
          discount_amount: discountAmount.toString(),
          tax_percentage: '0',
          tax_amount: taxAmount.toString(),
          total_amount: totalAmount.toString(),
          payment_method: input.payment_method,
          payment_amount: input.payment_amount.toString(),
          change_amount: changeAmount.toString(),
          status: 'completed',
          notes: input.notes,
        })
        .returning()
        .execute();

      const transaction = transactionResult[0];

      // Create transaction items and update stock
      for (const itemData of itemsData) {
        // Create transaction item
        await tx
          .insert(transactionItemsTable)
          .values({
            transaction_id: transaction.id,
            product_id: itemData.product_id,
            product_name: itemData.product_name,
            quantity: itemData.quantity,
            unit_price: itemData.unit_price.toString(),
            total_price: itemData.total_price.toString(),
          })
          .execute();

        // Update product stock
        await tx
          .update(productsTable)
          .set({
            stock_quantity: (await tx
              .select({ stock_quantity: productsTable.stock_quantity })
              .from(productsTable)
              .where(eq(productsTable.id, itemData.product_id))
              .execute())[0].stock_quantity - itemData.quantity,
            updated_at: new Date(),
          })
          .where(eq(productsTable.id, itemData.product_id))
          .execute();
      }

      // Return transaction with converted numeric fields
      return {
        ...transaction,
        subtotal: parseFloat(transaction.subtotal),
        discount_percentage: parseFloat(transaction.discount_percentage),
        discount_amount: parseFloat(transaction.discount_amount),
        tax_percentage: parseFloat(transaction.tax_percentage),
        tax_amount: parseFloat(transaction.tax_amount),
        total_amount: parseFloat(transaction.total_amount),
        payment_amount: parseFloat(transaction.payment_amount),
        change_amount: parseFloat(transaction.change_amount),
      };
    });
  } catch (error) {
    console.error('Transaction creation failed:', error);
    throw error;
  }
}

// Handler to get transactions with pagination and filtering
export async function getTransactions(input?: TransactionSearchInput): Promise<PaginatedTransactions> {
  try {
    const page = input?.page || 1;
    const limit = input?.limit || 10;
    const offset = (page - 1) * limit;

    // Build base query with join
    const baseQuery = db
      .select({
        transactions: transactionsTable,
        users: usersTable,
      })
      .from(transactionsTable)
      .innerJoin(usersTable, eq(transactionsTable.user_id, usersTable.id));

    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    if (input?.transaction_number) {
      conditions.push(ilike(transactionsTable.transaction_number, `%${input.transaction_number}%`));
    }

    if (input?.user_id) {
      conditions.push(eq(transactionsTable.user_id, input.user_id));
    }

    if (input?.status) {
      conditions.push(eq(transactionsTable.status, input.status));
    }

    if (input?.date_from) {
      const dateFrom = new Date(input.date_from);
      conditions.push(gte(transactionsTable.created_at, dateFrom));
    }

    if (input?.date_to) {
      const dateTo = new Date(input.date_to);
      conditions.push(lte(transactionsTable.created_at, dateTo));
    }

    // Build final query with conditions
    const finalQuery = conditions.length > 0 
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery;

    // Execute with ordering and pagination
    const results = await finalQuery
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit)
      .offset(offset)
      .execute();

    // Build count query
    const baseCountQuery = db
      .select({ count: count() })
      .from(transactionsTable);

    const finalCountQuery = conditions.length > 0
      ? baseCountQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseCountQuery;

    const totalResult = await finalCountQuery.execute();
    const total = totalResult[0].count;
    const totalPages = Math.ceil(total / limit);

    // Transform results to Transaction format
    const transactions = results.map(result => ({
      ...result.transactions,
      subtotal: parseFloat(result.transactions.subtotal),
      discount_percentage: parseFloat(result.transactions.discount_percentage),
      discount_amount: parseFloat(result.transactions.discount_amount),
      tax_percentage: parseFloat(result.transactions.tax_percentage),
      tax_amount: parseFloat(result.transactions.tax_amount),
      total_amount: parseFloat(result.transactions.total_amount),
      payment_amount: parseFloat(result.transactions.payment_amount),
      change_amount: parseFloat(result.transactions.change_amount),
    }));

    return {
      transactions,
      total,
      page,
      limit,
      total_pages: totalPages,
    };
  } catch (error) {
    console.error('Get transactions failed:', error);
    throw error;
  }
}

// Handler to get transaction by ID with items
export async function getTransactionById(id: number): Promise<(Transaction & { items: TransactionItem[] }) | null> {
  try {
    // Get transaction
    const transactionResult = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, id))
      .execute();

    if (!transactionResult.length) {
      return null;
    }

    const transaction = transactionResult[0];

    // Get transaction items
    const itemsResult = await db
      .select()
      .from(transactionItemsTable)
      .where(eq(transactionItemsTable.transaction_id, id))
      .execute();

    // Convert numeric fields
    const items = itemsResult.map(item => ({
      ...item,
      unit_price: parseFloat(item.unit_price),
      total_price: parseFloat(item.total_price),
    }));

    return {
      ...transaction,
      subtotal: parseFloat(transaction.subtotal),
      discount_percentage: parseFloat(transaction.discount_percentage),
      discount_amount: parseFloat(transaction.discount_amount),
      tax_percentage: parseFloat(transaction.tax_percentage),
      tax_amount: parseFloat(transaction.tax_amount),
      total_amount: parseFloat(transaction.total_amount),
      payment_amount: parseFloat(transaction.payment_amount),
      change_amount: parseFloat(transaction.change_amount),
      items,
    };
  } catch (error) {
    console.error('Get transaction by id failed:', error);
    throw error;
  }
}

// Handler to get transaction by transaction number
export async function getTransactionByNumber(transactionNumber: string): Promise<(Transaction & { items: TransactionItem[] }) | null> {
  try {
    // Get transaction
    const transactionResult = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.transaction_number, transactionNumber))
      .execute();

    if (!transactionResult.length) {
      return null;
    }

    const transaction = transactionResult[0];

    // Get transaction items
    const itemsResult = await db
      .select()
      .from(transactionItemsTable)
      .where(eq(transactionItemsTable.transaction_id, transaction.id))
      .execute();

    // Convert numeric fields
    const items = itemsResult.map(item => ({
      ...item,
      unit_price: parseFloat(item.unit_price),
      total_price: parseFloat(item.total_price),
    }));

    return {
      ...transaction,
      subtotal: parseFloat(transaction.subtotal),
      discount_percentage: parseFloat(transaction.discount_percentage),
      discount_amount: parseFloat(transaction.discount_amount),
      tax_percentage: parseFloat(transaction.tax_percentage),
      tax_amount: parseFloat(transaction.tax_amount),
      total_amount: parseFloat(transaction.total_amount),
      payment_amount: parseFloat(transaction.payment_amount),
      change_amount: parseFloat(transaction.change_amount),
      items,
    };
  } catch (error) {
    console.error('Get transaction by number failed:', error);
    throw error;
  }
}

// Handler to update transaction status
export async function updateTransactionStatus(id: number, status: 'pending' | 'completed' | 'cancelled'): Promise<Transaction> {
  try {
    return await db.transaction(async (tx) => {
      // Get current transaction
      const currentTransaction = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .execute();

      if (!currentTransaction.length) {
        throw new Error(`Transaction with id ${id} not found`);
      }

      // If cancelling a completed transaction, restore stock
      if (status === 'cancelled' && currentTransaction[0].status === 'completed') {
        const items = await tx
          .select()
          .from(transactionItemsTable)
          .where(eq(transactionItemsTable.transaction_id, id))
          .execute();

        for (const item of items) {
          await tx
            .update(productsTable)
            .set({
              stock_quantity: (await tx
                .select({ stock_quantity: productsTable.stock_quantity })
                .from(productsTable)
                .where(eq(productsTable.id, item.product_id))
                .execute())[0].stock_quantity + item.quantity,
              updated_at: new Date(),
            })
            .where(eq(productsTable.id, item.product_id))
            .execute();
        }
      }

      // Update transaction status
      const result = await tx
        .update(transactionsTable)
        .set({
          status,
          updated_at: new Date(),
        })
        .where(eq(transactionsTable.id, id))
        .returning()
        .execute();

      const transaction = result[0];

      return {
        ...transaction,
        subtotal: parseFloat(transaction.subtotal),
        discount_percentage: parseFloat(transaction.discount_percentage),
        discount_amount: parseFloat(transaction.discount_amount),
        tax_percentage: parseFloat(transaction.tax_percentage),
        tax_amount: parseFloat(transaction.tax_amount),
        total_amount: parseFloat(transaction.total_amount),
        payment_amount: parseFloat(transaction.payment_amount),
        change_amount: parseFloat(transaction.change_amount),
      };
    });
  } catch (error) {
    console.error('Update transaction status failed:', error);
    throw error;
  }
}

// Handler to get today's sales summary
export async function getTodaySalesSummary(): Promise<{ total_sales: number; total_transactions: number }> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const results = await db
      .select({
        total_sales: sum(transactionsTable.total_amount),
        total_transactions: count(),
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.status, 'completed'),
          gte(transactionsTable.created_at, today),
          lte(transactionsTable.created_at, tomorrow)
        )
      )
      .execute();

    return {
      total_sales: results[0].total_sales ? parseFloat(results[0].total_sales.toString()) : 0,
      total_transactions: results[0].total_transactions || 0,
    };
  } catch (error) {
    console.error('Get today sales summary failed:', error);
    throw error;
  }
}

// Handler to get monthly revenue
export async function getMonthlyRevenue(): Promise<number> {
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const results = await db
      .select({
        total_revenue: sum(transactionsTable.total_amount),
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.status, 'completed'),
          gte(transactionsTable.created_at, firstDayOfMonth),
          lte(transactionsTable.created_at, firstDayOfNextMonth)
        )
      )
      .execute();

    return results[0].total_revenue ? parseFloat(results[0].total_revenue.toString()) : 0;
  } catch (error) {
    console.error('Get monthly revenue failed:', error);
    throw error;
  }
}