import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: () => <Outlet />,
});
