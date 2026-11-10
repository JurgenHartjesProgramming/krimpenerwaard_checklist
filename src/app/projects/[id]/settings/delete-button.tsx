"use client";

import { useRouter } from "next/navigation";
import { deleteProject } from "@/actions/projects";
import { ActionButton } from "@/components/ActionForm";

export function DeleteProjectButton({ projectId, version, name }: { projectId: string; version: number; name: string }) {
  const router = useRouter();
  return (
    <ActionButton
      confirm={`Project "${name}" verwijderen?`}
      run={() => deleteProject(projectId, version)}
      onSuccess={() => router.push("/")}
    >
      Project verwijderen
    </ActionButton>
  );
}
