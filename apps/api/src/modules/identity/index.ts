// Public API of the identity module. Other modules import only from this file.
export { createIdentityService, type IdentityService } from './service';
export {
  createIdentityRoutes,
  sessionMiddleware,
  requireAuth,
  sessionCookieName,
  type AuthRateLimits,
} from './routes';
export { createPasswordHasher, type PasswordHasher } from './domain/password';
