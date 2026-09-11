import { useEffect, useState, type FormEvent } from "react";
import { Folder } from "lucide-react";
import { createWorkspace, getUserHome, pickDirectory } from "../shared/browserApi";

type CreateProjectFormProps = {
  onCreated: () => void;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Could not create the workspace.";
}

export default function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [folderName, setFolderName] = useState("workspace");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getUserHome()
      .then((home) => {
        if (!cancelled && home) setLocation(home);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedName = name.trim();
  const trimmedLocation = location.trim();
  const trimmedFolder = folderName.trim();
  const canCreate = Boolean(trimmedName && trimmedLocation && trimmedFolder) && !submitting;
  const previewPath =
    trimmedLocation && trimmedFolder
      ? `${trimmedLocation.replace(/[/\\]+$/, "")}/${trimmedFolder}`
      : "";

  const chooseLocation = async () => {
    try {
      const selected = await pickDirectory();
      if (selected) {
        setLocation(selected);
        setError(null);
      }
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
      await createWorkspace({
        name: trimmedName,
        location: trimmedLocation,
        folderName: trimmedFolder,
      });
      onCreated();
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
        <div className="flex items-center relative">
          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full bg-[#2a2a2a] border border-[#444] rounded p-2 text-sm text-neutral-200 pr-10 focus:outline-none focus:border-neutral-500"
          />
          <button
            type="button"
            onClick={() => void chooseLocation()}
            className="absolute right-2 p-1 text-neutral-500 hover:text-white"
            aria-label="Choose folder"
          >
            <Folder size={16} />
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white">Workspace folder name</span>
        <input
          type="text"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          className="w-full bg-[#2a2a2a] border border-[#444] rounded p-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
        />
      </label>

      {previewPath ? (
        <p className="text-xs text-neutral-500 truncate" title={previewPath}>
          {previewPath}
        </p>
      ) : null}

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
