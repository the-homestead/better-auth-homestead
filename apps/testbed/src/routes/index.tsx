import { createFileRoute } from "@tanstack/react-router";

import { TestbedDashboard } from "../components/testbed-dashboard.tsx";

export const Route = createFileRoute("/")({ component: TestbedDashboard });
