import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedUser {
  id: string;
  email: string;
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
