// Public API of the billing module. Other modules import only from this file.
export { createBillingService, type BillingService } from './service';
export { createBillingRoutes } from './routes';
