import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventTypeDescription, type EventTypeDescriptionProps } from "./EventTypeDescription";

// This is the exact markup `markdownToSafeHTML` produces on the server for the
// markdown input `A [link](https://x.com) here`.
const preSanitizedHTML =
  '<p>A <a target="_blank" class="text-blue-500 hover:text-blue-600" href="https://x.com">link</a> here</p>';

const eventType: EventTypeDescriptionProps["eventType"] = {
  id: 1,
  title: "Test event",
  length: 15,
  schedulingType: null,
  slug: "test-event",
  hidden: false,
  price: 0,
  currency: "USD",
  lockTimeZoneToggleOnBookingPage: false,
  lockedTimeZone: null,
  requiresConfirmation: false,
  requiresBookerEmailVerification: false,
  canSendCalVideoTranscriptionEmails: false,
  seatsPerTimeSlot: null,
  recurringEvent: null,
  metadata: {},
  descriptionAsSafeHTML: preSanitizedHTML,
} satisfies EventTypeDescriptionProps["eventType"];

describe("EventTypeDescription", () => {
  it("renders the server pre-sanitized descriptionAsSafeHTML verbatim", () => {
    const { container } = render(<EventTypeDescription eventType={eventType} className="test-desc" />);

    const descriptionEl = container.querySelector<HTMLDivElement>(".test-desc > div");
    expect(descriptionEl).not.toBeNull();
    // The styled anchor produced by the server must be rendered as-is. Re-processing the
    // markup on the client would strip the styling class from the anchor.
    expect(descriptionEl?.innerHTML).toContain('class="text-blue-500 hover:text-blue-600"');
    expect(descriptionEl?.innerHTML).toContain('href="https://x.com"');
  });
});
