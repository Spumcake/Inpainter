import { useEffect, useState, type FormEvent } from "react";
import { createWorkspace, getWorkspacesDir, pickDirectory } from "../shared/browserApi";
import type { WorkspaceRecord } from "../shared/types";

type CreateProjectFormProps = {
  onCreated: (workspace: WorkspaceRecord) => void;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Could not create the workspace.";
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "workspace";
}

function joinFolder(location: string, folder: string): string {
  const trimmed = location.replace(/[\\/]+$/, "");
  if (!trimmed) return folder;
  return `${trimmed}/${folder}`;
}

export default function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWorkspacesDir()
      .then((path) => {
        if (!cancelled) setLocation(path);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedName = name.trim();
  const folderName = slugify(trimmedName);
  const canCreate = Boolean(trimmedName && location.trim()) && !submitting;

  const onBrowse = async () => {
    setError(null);
    try {
      const selected = await pickDirectory();
      if (selected) setLocation(selected);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    setSubmitting(true);
    setError(null);
    try {
      const workspace = await createWorkspace({
        name: trimmedName,
        location: location.trim(),
      });
      onCreated(workspace);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 p-6 pt-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white">Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="w-full bg-[#2a2a2a] border border-[#444] rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white">Location</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="min-w-0 flex-1 bg-[#2a2a2a] border border-[#444] rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
          />
          <button
            type="button"
            onClick={() => void onBrowse()}
            className="shrink-0 rounded border border-[#444] px-3 py-2 text-sm text-neutral-200 hover:border-neutral-400 hover:text-white"
          >
            Browse
          </button>
        </div>
        {trimmedName ? (
          <span className="text-xs text-neutral-500">{joinFolder(location.trim(), folderName)}</span>
        ) : null}
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={!canCreate}
          className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-white"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}
