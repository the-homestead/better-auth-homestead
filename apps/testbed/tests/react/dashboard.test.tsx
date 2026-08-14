import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { TestbedDashboard } from "../../src/components/testbed-dashboard.tsx";

afterEach(cleanup);

describe("TestbedDashboard", () => {
  test("shows every installed Homestead plugin", () => {
    render(<TestbedDashboard />);

    expect(screen.getByRole("heading", { name: "Homestead Better Auth Testbed" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Steam" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "CFX" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Tebex" })).toBeDefined();
  });
});
