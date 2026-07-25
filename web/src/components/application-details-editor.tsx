import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUpdateApplication } from "@/hooks/use-applications";
import type { Application } from "@job-search-copilot/api/src/schemas/application.ts";

const JD_PREVIEW_CHARS = 200;

/**
 * Company/role title stay read-only in the card header (ApplicationList
 * already renders them there) — this only ever shows/edits the JD, plus
 * lets that same edit pass touch company/roleTitle since they're the
 * same tier of "core identifying field" and saving one without the
 * other would be an odd, arbitrary split.
 */
export function ApplicationDetailsEditor({
  id,
  company,
  roleTitle,
  jdText,
}: Pick<Application, "id" | "company" | "roleTitle" | "jdText">) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftCompany, setDraftCompany] = useState(company);
  const [draftRoleTitle, setDraftRoleTitle] = useState(roleTitle);
  const [draftJdText, setDraftJdText] = useState(jdText ?? "");
  const updateApplication = useUpdateApplication();

  function startEditing() {
    setDraftCompany(company);
    setDraftRoleTitle(roleTitle);
    setDraftJdText(jdText ?? "");
    setIsEditing(true);
  }

  function handleSave() {
    updateApplication.mutate(
      {
        id,
        input: {
          company: draftCompany.trim(),
          roleTitle: draftRoleTitle.trim(),
          jdText: draftJdText.trim() || null,
        },
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  if (!isEditing) {
    return (
      <div className="grid gap-1">
        {jdText && (
          <p className="text-muted-foreground text-xs whitespace-pre-line">
            {jdText.length > JD_PREVIEW_CHARS ? `${jdText.slice(0, JD_PREVIEW_CHARS)}…` : jdText}
          </p>
        )}
        <Button size="sm" variant="outline" className="w-fit" onClick={startEditing}>
          {jdText ? "Edit JD" : "Add JD"}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          className="h-8 text-xs"
          value={draftCompany}
          onChange={(e) => setDraftCompany(e.target.value)}
          placeholder="Company"
        />
        <Input
          className="h-8 text-xs"
          value={draftRoleTitle}
          onChange={(e) => setDraftRoleTitle(e.target.value)}
          placeholder="Role title"
        />
      </div>
      <textarea
        className="border-input min-h-16 rounded-md border bg-transparent px-2 py-1.5 text-xs shadow-sm"
        placeholder="Paste the JD"
        value={draftJdText}
        onChange={(e) => setDraftJdText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={updateApplication.isPending} onClick={handleSave}>
          {updateApplication.isPending ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
