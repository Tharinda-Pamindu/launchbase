import { Logomark } from "@/components/Logo";

export default function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center" role="status">
      <Logomark className="size-14 animate-pulse motion-reduce:animate-none" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
