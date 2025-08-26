import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Schema imports
import {
  createUserInputSchema,
  updateUserInputSchema,
  loginInputSchema,
  createCategoryInputSchema,
  updateCategoryInputSchema,
  createProductInputSchema,
  updateProductInputSchema,
  productSearchInputSchema,
  createTransactionInputSchema,
  transactionSearchInputSchema,
  generateReceiptInputSchema,
} from './schema';

// Handler imports
import { authenticateUser, getCurrentUser } from './handlers/auth';
import { 
  createUser, 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser 
} from './handlers/users';
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from './handlers/categories';
import {
  createProduct,
  getProducts,
  getProductById,
  getProductByBarcode,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
  updateProductStock,
} from './handlers/products';
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  getTransactionByNumber,
  updateTransactionStatus,
  getTodaySalesSummary,
  getMonthlyRevenue,
} from './handlers/transactions';
import {
  generateReceipt,
  generateThermalReceipt,
} from './handlers/receipts';
import {
  getDashboardSummary,
  getRecentTransactions,
  getTopSellingProducts,
} from './handlers/dashboard';
import { z } from 'zod';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  login: publicProcedure
    .input(loginInputSchema)
    .mutation(({ input }) => authenticateUser(input)),

  getCurrentUser: publicProcedure
    .input(z.number())
    .query(({ input }) => getCurrentUser(input)),

  // User management routes
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUsers: publicProcedure
    .query(() => getUsers()),

  getUserById: publicProcedure
    .input(z.number())
    .query(({ input }) => getUserById(input)),

  updateUser: publicProcedure
    .input(updateUserInputSchema)
    .mutation(({ input }) => updateUser(input)),

  deleteUser: publicProcedure
    .input(z.number())
    .mutation(({ input }) => deleteUser(input)),

  // Category management routes
  createCategory: publicProcedure
    .input(createCategoryInputSchema)
    .mutation(({ input }) => createCategory(input)),

  getCategories: publicProcedure
    .query(() => getCategories()),

  getCategoryById: publicProcedure
    .input(z.number())
    .query(({ input }) => getCategoryById(input)),

  updateCategory: publicProcedure
    .input(updateCategoryInputSchema)
    .mutation(({ input }) => updateCategory(input)),

  deleteCategory: publicProcedure
    .input(z.number())
    .mutation(({ input }) => deleteCategory(input)),

  // Product management routes
  createProduct: publicProcedure
    .input(createProductInputSchema)
    .mutation(({ input }) => createProduct(input)),

  getProducts: publicProcedure
    .input(productSearchInputSchema.optional())
    .query(({ input }) => getProducts(input)),

  getProductById: publicProcedure
    .input(z.number())
    .query(({ input }) => getProductById(input)),

  getProductByBarcode: publicProcedure
    .input(z.string())
    .query(({ input }) => getProductByBarcode(input)),

  updateProduct: publicProcedure
    .input(updateProductInputSchema)
    .mutation(({ input }) => updateProduct(input)),

  deleteProduct: publicProcedure
    .input(z.number())
    .mutation(({ input }) => deleteProduct(input)),

  getLowStockProducts: publicProcedure
    .query(() => getLowStockProducts()),

  updateProductStock: publicProcedure
    .input(z.object({ id: z.number(), quantity: z.number().int().nonnegative() }))
    .mutation(({ input }) => updateProductStock(input.id, input.quantity)),

  // Transaction routes
  createTransaction: publicProcedure
    .input(z.object({ 
      transaction: createTransactionInputSchema, 
      userId: z.number() 
    }))
    .mutation(({ input }) => createTransaction(input.transaction, input.userId)),

  getTransactions: publicProcedure
    .input(transactionSearchInputSchema.optional())
    .query(({ input }) => getTransactions(input)),

  getTransactionById: publicProcedure
    .input(z.number())
    .query(({ input }) => getTransactionById(input)),

  getTransactionByNumber: publicProcedure
    .input(z.string())
    .query(({ input }) => getTransactionByNumber(input)),

  updateTransactionStatus: publicProcedure
    .input(z.object({ 
      id: z.number(), 
      status: z.enum(['pending', 'completed', 'cancelled']) 
    }))
    .mutation(({ input }) => updateTransactionStatus(input.id, input.status)),

  getTodaySalesSummary: publicProcedure
    .query(() => getTodaySalesSummary()),

  getMonthlyRevenue: publicProcedure
    .query(() => getMonthlyRevenue()),

  // Receipt generation routes
  generateReceipt: publicProcedure
    .input(generateReceiptInputSchema)
    .mutation(({ input }) => generateReceipt(input)),

  generateThermalReceipt: publicProcedure
    .input(z.number())
    .query(({ input }) => generateThermalReceipt(input)),

  // Dashboard routes
  getDashboardSummary: publicProcedure
    .query(() => getDashboardSummary()),

  getRecentTransactions: publicProcedure
    .input(z.number().optional())
    .query(({ input }) => getRecentTransactions(input)),

  getTopSellingProducts: publicProcedure
    .input(z.number().optional())
    .query(({ input }) => getTopSellingProducts(input)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC POS server listening at port: ${port}`);
}

start();