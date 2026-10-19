import type { QueryClient } from "@tanstack/react-query";
export async function refreshLegalQueries(
  client: Pick<QueryClient, "invalidateQueries">,
  organizationId: string | null,
  kind: "profile" | "deadline",
  processId?: string,
) {
  const keys =
    kind === "profile"
      ? [
          ["legal-case-profile", organizationId, processId],
          ["legal-agenda", organizationId],
        ]
      : [["legal-deadlines", organizationId]];
  await Promise.all(
    [...keys, ["legal-workspace", organizationId], ["legal-cnj-processes", organizationId]].map(
      (queryKey) => client.invalidateQueries({ queryKey }),
    ),
  );
}
