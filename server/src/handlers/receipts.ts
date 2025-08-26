import { db } from '../db';
import { transactionsTable, transactionItemsTable, usersTable } from '../db/schema';
import { type GenerateReceiptInput } from '../schema';
import { eq, SQL } from 'drizzle-orm';

// Transaction with items and user info for receipt generation
interface TransactionWithDetails {
  id: number;
  transaction_number: string;
  customer_name: string | null;
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string;
  payment_amount: number;
  change_amount: number;
  created_at: Date;
  user_full_name: string;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

// Helper function to fetch transaction details
async function fetchTransactionDetails(transactionId: number): Promise<TransactionWithDetails> {
  // First get transaction with user info
  const transactionResults = await db
    .select()
    .from(transactionsTable)
    .innerJoin(usersTable, eq(transactionsTable.user_id, usersTable.id))
    .where(eq(transactionsTable.id, transactionId))
    .execute();

  if (transactionResults.length === 0) {
    throw new Error(`Transaction with ID ${transactionId} not found`);
  }

  const transactionData = transactionResults[0];
  const transaction = transactionData.transactions;
  const user = transactionData.users;

  // Get transaction items
  const itemResults = await db
    .select()
    .from(transactionItemsTable)
    .where(eq(transactionItemsTable.transaction_id, transactionId))
    .execute();

  const items = itemResults.map(item => ({
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: parseFloat(item.unit_price),
    total_price: parseFloat(item.total_price)
  }));

  return {
    id: transaction.id,
    transaction_number: transaction.transaction_number,
    customer_name: transaction.customer_name,
    subtotal: parseFloat(transaction.subtotal),
    discount_percentage: parseFloat(transaction.discount_percentage),
    discount_amount: parseFloat(transaction.discount_amount),
    tax_percentage: parseFloat(transaction.tax_percentage),
    tax_amount: parseFloat(transaction.tax_amount),
    total_amount: parseFloat(transaction.total_amount),
    payment_method: transaction.payment_method,
    payment_amount: parseFloat(transaction.payment_amount),
    change_amount: parseFloat(transaction.change_amount),
    created_at: transaction.created_at,
    user_full_name: user.full_name,
    items
  };
}

// Helper function to format currency
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Helper function to format date
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// Helper function to format time
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Handler to generate PDF receipt
export async function generateReceipt(input: GenerateReceiptInput): Promise<{ url: string; filename: string }> {
  try {
    // Fetch transaction details (validates transaction exists)
    const transaction = await fetchTransactionDetails(input.transaction_id);
    
    // Generate filename with transaction data
    const timestamp = Date.now();
    const filename = `receipt-${transaction.transaction_number}-${timestamp}.pdf`;
    
    // In a real implementation, this would:
    // 1. Use a PDF library like PDFKit to generate the actual PDF
    // 2. Save the PDF to a storage service or local filesystem
    // 3. Return the actual URL where the PDF can be accessed
    
    // For now, we return the expected structure
    return {
      url: `/receipts/${filename}`,
      filename: filename,
    };
  } catch (error) {
    console.error('Receipt generation failed:', error);
    throw error;
  }
}

// Handler to generate thermal printer receipt format
export async function generateThermalReceipt(transactionId: number): Promise<string> {
  try {
    const transaction = await fetchTransactionDetails(transactionId);
    
    // Store information
    const storeHeader = [
      '=====================================',
      '           POS SYSTEM STORE',
      '         123 Business Street',
      '         Business City 12345',
      '         Tel: (555) 123-4567',
      '====================================='
    ].join('\n');

    // Transaction header
    const transactionHeader = [
      `Date: ${formatDate(transaction.created_at)}`,
      `Time: ${formatTime(transaction.created_at)}`,
      `Transaction: ${transaction.transaction_number}`,
      `Cashier: ${transaction.user_full_name}`,
      transaction.customer_name ? `Customer: ${transaction.customer_name}` : '',
      '====================================='
    ].filter(line => line).join('\n');

    // Items header
    const itemsHeader = 'ITEM                QTY   PRICE  TOTAL';
    const itemsSeparator = '-------------------------------------';

    // Format items (truncate names to fit 58mm thermal printer)
    const itemLines = transaction.items.map(item => {
      const name = item.product_name.length > 16 ? 
        item.product_name.substring(0, 13) + '...' : 
        item.product_name;
      
      const qty = `${item.quantity}x`;
      const price = formatCurrency(item.unit_price);
      const total = formatCurrency(item.total_price);
      
      // Format with fixed positions for alignment
      const namePart = name.padEnd(16);
      const qtyPart = qty.padStart(4);
      const pricePart = price.padStart(7);
      const totalPart = total.padStart(7);
      
      return `${namePart}${qtyPart}${pricePart}${totalPart}`;
    });

    // Totals section with consistent alignment
    const totalsSection = [
      itemsSeparator,
      `${' '.repeat(19)}Subtotal: ${formatCurrency(transaction.subtotal)}`,
      transaction.discount_amount > 0 ? 
        `${' '.repeat(19)}Discount: ${formatCurrency(transaction.discount_amount)}` : '',
      transaction.tax_amount > 0 ? 
        `${' '.repeat(23)}Tax: ${formatCurrency(transaction.tax_amount)}` : '',
      itemsSeparator,
      `${' '.repeat(23)}TOTAL: ${formatCurrency(transaction.total_amount)}`,
      `${' '.repeat(16)}${transaction.payment_method.toUpperCase()}: ${formatCurrency(transaction.payment_amount)}`,
      transaction.change_amount > 0 ? 
        `${' '.repeat(22)}CHANGE:  ${formatCurrency(transaction.change_amount)}` : ''
    ].filter(line => line).join('\n');

    // Footer
    const footer = [
      '=====================================',
      '    Thank you for shopping!',
      '       Visit us again soon!',
      '====================================='
    ].join('\n');

    // Combine all sections
    const receipt = [
      storeHeader,
      transactionHeader,
      itemsHeader,
      itemsSeparator,
      ...itemLines,
      totalsSection,
      footer
    ].join('\n');

    return receipt;
  } catch (error) {
    console.error('Thermal receipt generation failed:', error);
    throw error;
  }
}