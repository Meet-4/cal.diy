/**
 * Mocks are required here because:
 * - The repository modules import Prisma services whose transitive dependencies
 *   (DB connections, generated clients) cannot be resolved in the Jest unit-test
 *   environment. We mock them to isolate createStripeCustomerId.
 * - @calcom/platform-constants resolves to an unbuilt dist in this environment,
 *   so it is mocked virtually. SUCCESS_STATUS is its only runtime usage here.
 */
jest.mock("@/modules/apps/apps.repository", () => ({
  AppsRepository: class {},
}));
jest.mock("@/modules/credentials/credentials.repository", () => ({
  CredentialsRepository: class {},
}));
jest.mock("@/modules/memberships/memberships.repository", () => ({
  MembershipsRepository: class {},
}));
jest.mock("@/modules/users/users.repository", () => ({
  UsersRepository: class {},
}));
jest.mock("@calcom/platform-constants", () => ({ SUCCESS_STATUS: "success" }), { virtual: true });

import type { User } from "@calcom/prisma/client";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { StripeService } from "./stripe.service";
import type { AppConfig } from "@/config/type";
import { AppsRepository } from "@/modules/apps/apps.repository";
import { CredentialsRepository } from "@/modules/credentials/credentials.repository";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { UsersRepository } from "@/modules/users/users.repository";

describe("StripeService.createStripeCustomerId", () => {
  let service: StripeService;
  let mockListCustomers: jest.Mock;
  let mockCreateCustomer: jest.Mock;
  let mockUpdateByEmail: jest.Mock;

  const user = {
    email: "owner@example.com",
    name: "Owner",
    metadata: { theme: "auto" },
  } as unknown as Pick<User, "email" | "name" | "metadata">;

  beforeEach(() => {
    mockListCustomers = jest.fn();
    mockCreateCustomer = jest.fn();
    mockUpdateByEmail = jest.fn();

    const configStub = {
      get: (key: string) => {
        if (key === "stripe.apiKey") {
          return "test-api-key";
        }
        return `stub-${key}`;
      },
    };

    service = new StripeService(
      configStub as unknown as ConfigService<AppConfig>,
      configStub as unknown as ConfigService,
      {} as unknown as AppsRepository,
      {} as unknown as CredentialsRepository,
      {} as unknown as MembershipsRepository,
      { updateByEmail: mockUpdateByEmail } as unknown as UsersRepository
    );

    jest.spyOn(service, "getStripe").mockReturnValue({
      customers: { list: mockListCustomers, create: mockCreateCustomer },
    } as unknown as Stripe);
  });

  it("reuses the existing Stripe customer instead of creating a duplicate", async () => {
    mockListCustomers.mockResolvedValue({ data: [{ id: "cus_existing123" }] });

    const customerId = await service.createStripeCustomerId(user);

    expect(customerId).toBe("cus_existing123");
    expect(mockListCustomers).toHaveBeenCalledWith({ email: user.email, limit: 1 });
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockUpdateByEmail).toHaveBeenCalledWith(user.email, {
      metadata: { theme: "auto", stripeCustomerId: "cus_existing123" },
    });
  });

  it("creates a customer only when no customer exists for the email", async () => {
    mockListCustomers.mockResolvedValue({ data: [] });
    mockCreateCustomer.mockResolvedValue({ id: "cus_new123" });

    const customerId = await service.createStripeCustomerId(user);

    expect(customerId).toBe("cus_new123");
    expect(mockCreateCustomer).toHaveBeenCalledTimes(1);
    expect(mockCreateCustomer).toHaveBeenCalledWith({ email: user.email });
    expect(mockUpdateByEmail).toHaveBeenCalledWith(user.email, {
      metadata: { theme: "auto", stripeCustomerId: "cus_new123" },
    });
  });

  it("propagates Stripe API errors instead of silently creating a duplicate customer", async () => {
    const stripeError = new Error("Stripe API error: rate limit exceeded");
    mockListCustomers.mockRejectedValue(stripeError);

    await expect(service.createStripeCustomerId(user)).rejects.toThrow(stripeError);

    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(mockUpdateByEmail).not.toHaveBeenCalled();
  });
});
