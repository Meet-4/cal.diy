import type { UseBookingFormReturnType } from "@calcom/features/bookings/Booker/hooks/useBookingForm";
import type { RecurringEvent } from "@calcom/types/Calendar";
import { showToast } from "@calcom/ui/components/toast";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Imported via a repo-relative path so the test pins the workspace copy of the
// hook (the package specifier resolves through node_modules symlinks).
import { useHandleBookEvent } from "../../../../../packages/platform/atoms/hooks/bookings/useHandleBookEvent";

const h = vi.hoisted(() => {
  const holder: { bookerState: Record<string, unknown>; platform: boolean } = {
    bookerState: {},
    platform: false,
  };
  return {
    holder,
    getBookerState: () => holder.bookerState,
    isPlatform: () => holder.platform,
  };
});

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
}));

vi.mock("@calcom/features/bookings/Booker/BookerStoreProvider", () => ({
  useBookerStoreContext: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector(h.getBookerState())
  ),
}));

vi.mock("../../../../../packages/platform/atoms/hooks/useIsPlatform", () => ({
  useIsPlatform: vi.fn(() => h.isPlatform()),
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: vi.fn(() => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  })),
}));

vi.mock("@calcom/features/bookings/Booker/hooks/useBookerTime", () => ({
  useBookerTime: vi.fn(() => ({ timezone: "UTC" })),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => "/"),
}));

vi.mock("@calcom/features/bookings/lib", () => ({
  mapBookingToMutationInput: vi.fn((input: Record<string, unknown>) => ({ ...input, mapped: true })),
  mapRecurringBookingToMutationInput: vi.fn((input: Record<string, unknown>, count: number) => [
    { ...input, mapped: true, count },
  ]),
}));

const mockedShowToast = vi.mocked(showToast);

const createMockStore = (overrides: Record<string, unknown> = {}) => ({
  setFormValues: vi.fn(),
  selectedTimeslot: "2026-10-30T10:00:00.000Z",
  selectedDuration: 30,
  rescheduleUid: null,
  rescheduledBy: null,
  bookingData: null,
  seatedEventData: null,
  org: null,
  teamMemberEmail: null,
  crmOwnerRecordType: null,
  crmAppSlug: null,
  crmRecordId: null,
  verificationCode: null,
  username: null,
  recurringEventCount: null,
  ...overrides,
});

const bookingForm = {
  getValues: vi.fn(() => ({ responses: { name: "Test User", email: "test@example.com" } })),
  clearErrors: vi.fn(),
} as unknown as UseBookingFormReturnType["bookingForm"];

const baseEvent = {
  data: {
    id: 1,
    isDynamic: false,
    length: 30,
    slug: "discovery",
    metadata: {},
    // Typed as the real BookerEvent["recurringEvent"] so both the non-recurring
    // mock here and the recurring one below are assignable to the hook's prop.
    recurringEvent: null as RecurringEvent | null,
    schedulingType: null,
  },
};

const renderUseHandleBookEvent = ({
  event = baseEvent,
  handleBooking = vi.fn(),
  handleRecBooking = vi.fn(),
} = {}) =>
  renderHook(() =>
    useHandleBookEvent({
      bookingForm,
      event,
      metadata: {},
      hashedLink: null,
      handleBooking,
      handleRecBooking,
      isBookingDryRun: false,
    })
  );

describe("useHandleBookEvent - error surfacing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.holder.platform = false;
    h.holder.bookerState = createMockStore();
  });

  afterEach(() => {
    cleanup();
  });

  it("passes an onError callback to handleBooking on the confirm step (no explicit timeslot)", () => {
    const handleBooking = vi.fn();
    const { result } = renderUseHandleBookEvent({ handleBooking });

    act(() => {
      result.current();
    });

    expect(handleBooking).toHaveBeenCalledTimes(1);
    const callbacks = handleBooking.mock.calls[0]?.[1] as { onError?: (err: unknown) => void } | undefined;
    // Regression test for #29291: without the fix, callbacks is undefined here so a
    // non-OK /api/book/event response never reaches the user.
    expect(callbacks?.onError).toBeInstanceOf(Function);

    act(() => {
      callbacks?.onError?.(new Error("booking_conflict"));
    });

    expect(mockedShowToast).toHaveBeenCalledWith("booking_conflict", "error");
  });

  it("passes an onError callback to handleRecBooking for recurring bookings", () => {
    h.holder.bookerState = createMockStore({ recurringEventCount: 3 });
    const handleRecBooking = vi.fn();
    // freq: 2 = rrule Frequency.WEEKLY; a numeric literal is assignable to the enum.
    const recurringEvent = {
      ...baseEvent,
      data: { ...baseEvent.data, recurringEvent: { count: 3, freq: 2, interval: 1 } },
    };
    const { result } = renderUseHandleBookEvent({
      event: recurringEvent,
      handleRecBooking,
    });

    act(() => {
      result.current();
    });

    expect(handleRecBooking).toHaveBeenCalledTimes(1);
    const callbacks = handleRecBooking.mock.calls[0]?.[1] as { onError?: (err: unknown) => void } | undefined;
    expect(callbacks?.onError).toBeInstanceOf(Function);

    act(() => {
      callbacks?.onError?.("not an error object");
    });

    expect(mockedShowToast).toHaveBeenCalledWith("can_you_try_again", "error");
  });

  it("keeps passing onError when the booking is triggered from a timeslot click", () => {
    const handleBooking = vi.fn();
    const { result } = renderUseHandleBookEvent({ handleBooking });

    act(() => {
      result.current("2026-10-30T09:00:00.000Z");
    });

    const callbacks = handleBooking.mock.calls[0]?.[1] as { onError?: (err: unknown) => void } | undefined;
    expect(callbacks?.onError).toBeInstanceOf(Function);
  });

  it("does not add the toast callback on platform, where errors are rendered inline", () => {
    h.holder.platform = true;
    const handleBooking = vi.fn();
    const { result } = renderUseHandleBookEvent({ handleBooking });

    act(() => {
      result.current();
    });

    expect(handleBooking).toHaveBeenCalledTimes(1);
    expect(handleBooking.mock.calls[0]?.[1]).toBeUndefined();
  });
});
