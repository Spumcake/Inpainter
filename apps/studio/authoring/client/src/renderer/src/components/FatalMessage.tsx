export function FatalMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <p className="text-center text-sm text-fg">{message}</p>
    </div>
  );
}
