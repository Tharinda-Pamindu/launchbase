import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "@/styles.css?url";

// Document shell for every page. `head` replaces the Next.js `metadata`
// export — add per-route metadata with a `head` on that route's file.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Floppy" },
      {
        name: "description",
        content: "Weekly planning for software teams. Less strain. More brain.",
      },
      { name: "theme-color", content: "#FF5722" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
