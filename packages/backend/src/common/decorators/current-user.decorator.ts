import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedUser {
  id: string;
  // The login identifier the owner assigned. Always present — unlike email,
  // which is optional contact detail since the move off Clerk.
  username: string;
  email: string | null;
  factoryId: string;
  role: string;
}

// Usage: findAll(@CurrentUser() user: AuthenticatedUser)
// Every service method that touches tenant data takes user.factoryId
// and filters on it — this is the multi-tenant enforcement point.
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
