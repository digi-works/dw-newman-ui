"use client";

import { useCopilotAction } from "@copilotkit/react-core";

export function RegisterBookingsTable() {
  useCopilotAction({
    name: "fetchAndDisplayBookings",
    description: "Fetches room bookings and displays them in a visual table format inside the chat.",
    parameters: [],
    // The handler is REQUIRED by CopilotKit, even if it doesn't do anything yet!
    handler: async () => {
      return "Successfully showed the bookings table to the user.";
    },
    render: () => {
      // Later, we will swap this out with your actual NeonDB bookings table component
      return (
        <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
          <em>[Bookings Table will render here]</em>
        </div>
      );
    },
  });

  // This component doesn't render any visible UI in the layout itself, 
  // it just secretly registers the action with CopilotKit in the background.
  return null; 
}